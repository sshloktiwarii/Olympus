#!/usr/bin/env python3
"""
Apex-Warden: Hardware Protection Daemon.
Prevents AI-induced kernel panics and thermal lockups via Mach/sysctl or /proc telemetry.
Sends SIGSTOP to target processes when memory pressure > 85%, and SIGCONT when < 70%.
"""

from __future__ import annotations

import ctypes
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from typing import List, Set


def get_memory_pressure_pct() -> float:
    """Uses ctypes to interface with macOS Mach/sysctl or Linux /proc to read active memory pressure."""
    if sys.platform == "darwin":
        try:
            # Check vm_stat on Darwin via libSystem
            libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
            class VmStatistics64(ctypes.Structure):
                _fields_ = [
                    ("free_count", ctypes.c_uint32),
                    ("active_count", ctypes.c_uint32),
                    ("inactive_count", ctypes.c_uint32),
                    ("wire_count", ctypes.c_uint32),
                    ("zero_fill_count", ctypes.c_uint64),
                    ("reactivations", ctypes.c_uint64),
                    ("pageins", ctypes.c_uint64),
                    ("pageouts", ctypes.c_uint64),
                    ("faults", ctypes.c_uint64),
                    ("cow_faults", ctypes.c_uint64),
                    ("lookups", ctypes.c_uint64),
                    ("hits", ctypes.c_uint64),
                    ("purges", ctypes.c_uint64),
                    ("purgeable_count", ctypes.c_uint32),
                    ("speculative_count", ctypes.c_uint32),
                    ("decompressions", ctypes.c_uint64),
                    ("compressions", ctypes.c_uint64),
                    ("swapins", ctypes.c_uint64),
                    ("swapouts", ctypes.c_uint64),
                    ("compressor_page_count", ctypes.c_uint32),
                    ("throttled_count", ctypes.c_uint32),
                    ("external_page_count", ctypes.c_uint32),
                    ("internal_page_count", ctypes.c_uint32),
                    ("total_uncompressed_pages_in_compressor", ctypes.c_uint64),
                ]
            vm_stat = VmStatistics64()
            count = ctypes.c_uint32(ctypes.sizeof(VmStatistics64) // 4)
            # mach_host_self = libc.mach_host_self
            host_port = libc.mach_host_self()
            # host_statistics64(host_port, HOST_VM_INFO64=4, (host_info64_t)&vm_stat, &count)
            ret = libc.host_statistics64(host_port, 4, ctypes.byref(vm_stat), ctypes.byref(count))
            if ret == 0:
                total_used = vm_stat.active_count + vm_stat.wire_count + vm_stat.compressor_page_count
                total_avail = total_used + vm_stat.free_count + vm_stat.inactive_count
                if total_avail > 0:
                    return (total_used / total_avail) * 100.0
        except Exception:
            pass

    # Linux /proc/meminfo or generic fallback
    if os.path.exists("/proc/meminfo"):
        try:
            mem_total, mem_available = 0, 0
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        mem_total = int(line.split()[1])
                    elif line.startswith("MemAvailable:"):
                        mem_available = int(line.split()[1])
            if mem_total > 0:
                return ((mem_total - mem_available) / mem_total) * 100.0
        except Exception:
            pass

    return 25.0


def find_target_pids(target_names: List[str]) -> Set[int]:
    """Finds PIDs of processes matching any of the target names."""
    pids: Set[int] = set()
    my_pid = os.getpid()
    try:
        res = subprocess.run(["pgrep", "-f", "|".join(target_names)], capture_output=True, text=True)
        for line in res.stdout.strip().splitlines():
            if line.isdigit():
                pid = int(line)
                if pid != my_pid:
                    pids.add(pid)
    except Exception:
        pass
    return pids


def log_event(message: str) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
    print(f"[{now}] [Apex-Warden] {message}", flush=True)


def run_warden(targets: List[str], check_interval_sec: float = 1.0) -> None:
    log_event(f"Warden daemon initialized. Monitoring memory pressure for targets: {targets}")
    is_throttled = False
    frozen_pids: Set[int] = set()

    try:
        while True:
            pressure = get_memory_pressure_pct()

            if pressure >= 85.0 and not is_throttled:
                is_throttled = True
                active_pids = find_target_pids(targets)
                frozen_pids = active_pids
                log_event(f"CRITICAL: Memory pressure at {pressure:.2f}% >= 85%. Freezing {len(active_pids)} processes with SIGSTOP...")
                for pid in active_pids:
                    try:
                        os.kill(pid, signal.SIGSTOP)
                        log_event(f"  -> SIGSTOP sent to PID {pid}")
                    except ProcessLookupError:
                        pass
                    except PermissionError:
                        log_event(f"  -> Permission denied for PID {pid}")

            elif pressure < 70.0 and is_throttled:
                is_throttled = False
                log_event(f"RECOVERY: Memory pressure dropped to {pressure:.2f}% < 70%. Resuming {len(frozen_pids)} processes with SIGCONT...")
                for pid in frozen_pids:
                    try:
                        os.kill(pid, signal.SIGCONT)
                        log_event(f"  -> SIGCONT sent to PID {pid}")
                    except ProcessLookupError:
                        pass
                frozen_pids.clear()

            time.sleep(check_interval_sec)
    except KeyboardInterrupt:
        log_event("Shutting down Warden. Resuming all frozen processes...")
        for pid in frozen_pids:
            try:
                os.kill(pid, signal.SIGCONT)
            except Exception:
                pass


if __name__ == "__main__":
    targets = sys.argv[1:] if len(sys.argv) > 1 else ["ollama", "vllm", "python"]
    run_warden(targets)
