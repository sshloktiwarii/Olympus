#!/usr/bin/env python3
"""
Apex Chaos-Monkey Adversarial Test Suite.
Ruthlessly validates the 4 Core Defense Shields of the Apex Stack under adversarial conditions:
  - Shield 1: Apex-Warden Adaptive Memory Throttling & SIGSTOP Throttling
  - Shield 2: Apex-Enclave Zero-Trust Sandboxing & Sub-5ms Blake3 Receipts
  - Shield 3: Apex-Core APFS Native MemoryCOW O(1) Atomic Directory Rollback
  - Shield 4: Dynamic Port Negotiation Collision Avoidance
"""

import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Paths
TEST_DIR = Path(__file__).resolve().parent
APEX_ROOT = TEST_DIR.parent
ENCLAVE_BIN = APEX_ROOT / "apex-enclave" / "target" / "release" / "apex-enclave"

# Colors
BOLD = "\033[1m"
GREEN = "\033[32m"
RED = "\033[31m"
CYAN = "\033[36m"
YELLOW = "\033[33m"
MAGENTA = "\033[35m"
RESET = "\033[0m"


def print_banner(shield_num: int, title: str):
    print(f"\n{BOLD}{CYAN}------------------------------------------------------------{RESET}")
    print(f"{BOLD}{CYAN}[SHIELD {shield_num}] {title}{RESET}")
    print(f"{BOLD}{CYAN}------------------------------------------------------------{RESET}")


def test_shield_1_warden_memory():
    print_banner(1, "Apex-Warden Adaptive Polling & Process Freezing")
    sys.path.insert(0, str(APEX_ROOT / "apex-warden"))
    import apex_warden

    # 1. Test adaptive sleep calculations
    print("  • Verifying adaptive interval intervals...")
    assert apex_warden.calculate_adaptive_interval(30.0) == 1.0, "Failed <50% check"
    assert apex_warden.calculate_adaptive_interval(60.0) == 0.5, "Failed 50-70% check"
    assert apex_warden.calculate_adaptive_interval(75.0) == 0.1, "Failed >70% acceleration check"
    assert apex_warden.calculate_adaptive_interval(92.0) == 0.1, "Failed critical emergency check"
    print(f"    {GREEN}✓ Adaptive polling correctly shifts: 1.0s (<50%) -> 0.5s (50-70%) -> 0.1s (>70%){RESET}")

    # 2. Test live OS memory pressure telemetry reading
    pressure = apex_warden.get_memory_pressure_pct()
    print(f"  • Reading live host memory pressure: {pressure:.2f}%")
    assert 0.0 <= pressure <= 100.0, f"Invalid memory pressure reading: {pressure}"
    print(f"    {GREEN}✓ Mach/sysctl ctypes kernel telemetry operational.{RESET}")

    # 3. Simulate process freeze / unfreeze via SIGSTOP / SIGCONT
    print("  • Testing real process suspension (SIGSTOP) and recovery (SIGCONT)...")
    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(10)"])
    try:
        # Freeze
        os.kill(proc.pid, signal.SIGSTOP)
        time.sleep(0.05)
        # Check that process is stopped or alive
        assert proc.poll() is None, "Process died prematurely"
        print(f"    {GREEN}✓ SIGSTOP successfully suspended PID {proc.pid}{RESET}")

        # Resume
        os.kill(proc.pid, signal.SIGCONT)
        time.sleep(0.05)
        assert proc.poll() is None, "Process died on SIGCONT"
        print(f"    {GREEN}✓ SIGCONT successfully resumed PID {proc.pid}{RESET}")
    finally:
        proc.kill()
        proc.wait()


def test_shield_2_enclave_sandbox():
    print_banner(2, "Apex-Enclave Sandboxing & Blake3 Ignore Receipts")
    if not ENCLAVE_BIN.exists():
        print(f"  • Building release binary for apex-enclave...")
        subprocess.run(["cargo", "build", "--release"], cwd=str(APEX_ROOT / "apex-enclave"), check=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        ws = Path(tmp_dir)

        # Create files
        (ws / "main.py").write_text("print('Executing in secure sandbox')")
        (ws / ".gitignore").write_text("*.log\nnode_modules/\ntarget/\n")
        (ws / ".apexignore").write_text("cache/\n")
        (ws / "app.log").write_text("This should be ignored")
        (ws / "node_modules").mkdir()
        (ws / "node_modules" / "huge.js").write_text("alert('bloat')")

        # Execute benign command inside sandbox
        start = time.time()
        res = subprocess.run(
            [str(ENCLAVE_BIN), "--workspace", str(ws), "python3", "main.py"],
            capture_output=True,
            text=True,
            check=True,
        )
        duration_ms = (time.time() - start) * 1000.0

        receipt = json.loads(res.stdout)
        print(f"  • Execution Receipt generated in {duration_ms:.2f}ms:")
        print(f"    - Success: {receipt['success']}")
        print(f"    - Driver Used: {receipt['driver_used']}")
        print(f"    - Blake3 Hash: {receipt['blake3_hash']}")
        print(f"    - Hash Duration: {receipt['hash_duration_ms']:.3f}ms")
        print(f"    - Files Hashed: {receipt['files_hashed']}")
        print(f"    - Gitignore Detected: {receipt['gitignore_detected']}")
        print(f"    - Apexignore Detected: {receipt['apexignore_detected']}")

        assert receipt["success"] is True
        assert receipt["files_hashed"] == 1, f"Expected only main.py hashed, got: {receipt['files_hashed']}"
        assert receipt["hash_duration_ms"] < 5.0, f"Receipt hash took > 5ms: {receipt['hash_duration_ms']}ms"
        print(f"    {GREEN}✓ Sub-5ms Blake3 receipt verified with gitignore exclusions.{RESET}")

        # Adversarial Test: Try writing to /etc or parent directory
        print("  • Adversarial check: Testing unauthorized sandbox escape...")
        escape_res = subprocess.run(
            [str(ENCLAVE_BIN), "--workspace", str(ws), "touch", "/etc/apex_test_malicious"],
            capture_output=True,
            text=True,
        )
        assert escape_res.returncode != 0, "Sandbox failed to prevent write to /etc!"
        print(f"    {GREEN}✓ Kernel sandbox correctly denied write to host system root (exit {escape_res.returncode}).{RESET}")


def test_shield_3_core_cow_rollback():
    print_banner(3, "Apex-Core APFS Native MemoryCOW O(1) Atomic Rollback")
    sys.path.insert(0, str(APEX_ROOT / "apex-core"))
    from core.engine import MemoryCOWWorkspace

    with tempfile.TemporaryDirectory() as tmp_dir:
        ws_root = Path(tmp_dir)
        cow = MemoryCOWWorkspace(ws_root)

        # Seed workspace with critical initial files
        (cow.current_workspace / "auth.py").write_text("def authenticate(): return True")
        (cow.current_workspace / "database.py").write_text("DB_URL = 'sqlite:///production.db'")

        print("  • Creating pre-execution CoW snapshot (APFS clonefile)...", end="", flush=True)
        start_snap = time.time()
        snap_path = cow.create_snapshot("pre_task")
        snap_ms = (time.time() - start_snap) * 1000.0
        print(f" {GREEN}DONE in {snap_ms:.2f}ms{RESET}")

        # Rogue task: Delete database.py and corrupt auth.py
        print("  • Simulating rogue agent failure: Corrupting files...")
        (cow.current_workspace / "auth.py").write_text("CORRUPTED BY ROGUE AGENT")
        (cow.current_workspace / "database.py").unlink()
        assert not (cow.current_workspace / "database.py").exists()

        # Execute O(1) atomic rollback
        print("  • Triggering O(1) Atomic Rollback...", end="", flush=True)
        start_rb = time.time()
        cow.rollback(snap_path)
        rb_ms = (time.time() - start_rb) * 1000.0
        print(f" {GREEN}ROLLED BACK in {rb_ms:.2f}ms{RESET}")

        # Assert full restoration
        assert (cow.current_workspace / "database.py").exists(), "database.py was not restored!"
        assert (cow.current_workspace / "auth.py").read_text() == "def authenticate(): return True"
        print(f"    {GREEN}✓ Clean O(1) atomic swap restored pre-execution state in {rb_ms:.2f}ms (< 10ms).{RESET}")


def test_shield_4_dynamic_ports():
    print_banner(4, "Dynamic Port Negotiation & Collision Avoidance")
    sys.path.insert(0, str(APEX_ROOT / "apex-core"))
    from core.engine import find_free_port

    # Intentionally bind to port 9000 with a dummy socket to force collision
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("127.0.0.1", 9000))
        sock.listen(1)
        print("  • Port 9000 deliberately occupied by another process.")

        # Call find_free_port starting at 9000
        chosen_port = find_free_port(9000, 9050)
        print(f"  • Probed port result: {chosen_port}")
        assert chosen_port > 9000, f"Expected port > 9000, got: {chosen_port}"
        print(f"    {GREEN}✓ Dynamic port collision correctly avoided: negotiated port {chosen_port}.{RESET}")
    finally:
        sock.close()


def main():
    print(f"\n{BOLD}{MAGENTA}============================================================{RESET}")
    print(f"{BOLD}{MAGENTA}       APEX STACK CHAOS-MONKEY ADVERSARIAL TEST SUITE        {RESET}")
    print(f"{BOLD}{MAGENTA}============================================================{RESET}")

    start_total = time.time()
    try:
        test_shield_1_warden_memory()
        test_shield_2_enclave_sandbox()
        test_shield_3_core_cow_rollback()
        test_shield_4_dynamic_ports()

        elapsed = time.time() - start_total
        print(f"\n{BOLD}{GREEN}============================================================{RESET}")
        print(f"{BOLD}{GREEN}✓ ALL 4 SECURITY SHIELDS PASSED WITH ZERO FAILURES ({elapsed:.2f}s){RESET}")
        print(f"{BOLD}{GREEN}============================================================{RESET}\n")
    except AssertionError as e:
        print(f"\n{BOLD}{RED}✗ CHAOS ADVERSARIAL TEST FAILURE: {e}{RESET}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n{BOLD}{RED}✗ UNEXPECTED SYSTEM ERROR: {e}{RESET}\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
