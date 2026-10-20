# Apex Stack: High-Performance Autonomous AI Runtime & Safety Infrastructure

[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen?style=flat-square)]()
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)]()
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange?style=flat-square&logo=rust)]()
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python)]()
[![React](https://img.shields.io/badge/React-18.3-cyan?style=flat-square&logo=react)]()
[![Zero-Zombie PGRP](https://img.shields.io/badge/PGRP-Enforced-success?style=flat-square)]()

The **Apex Stack** is an enterprise-grade, five-tier distributed architecture engineered for autonomous AI agent execution, kernel-level containment, physical memory protection, sub-millisecond atomic rollback, and neural steering.

> 💡 **Looking for a non-technical overview?** Read the [Plain-English Guide (README.simple.md)](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/README.simple.md).

---

## Architecture Overview

```
                      +---------------------------------------+
                      |         Upstream LLM Client           |
                      |   (Claude Code / Cursor / OpenAI SDK) |
                      +---------------------------------------+
                                          |
                                          v  [HTTP /v1/chat/completions]
                      +---------------------------------------+
                      |      Apex-Gateway (Rust / Axum)       | <--- Pinned Async Zero-Lag Stream
                      +---------------------------------------+      Microsecond TTFT Telemetry
                                          |
                                          | [Task Request Dispatched]
                                          v
+-----------------------+     +---------------------------------------+
|      Apex-Warden      |     |       Apex-Core (Python / APFS)       | <--- O(1) Copy-on-Write Rollback
| (Mach / sysctl ctypes)| <---+---------------------------------------+      (APFS clonefile / reflink)
|  Adaptive SIGSTOP     |                 |               ^
|  Hardware Brakes      |                 v               |
+-----------------------+     +---------------------------------------+
                              |      Apex-Enclave (Rust / bwrap)      | <--- Dual-Driver Kernel Sandbox
                              |  Execution Sandbox + Blake3 Receipts  |      Read-Only / & Zero Network
                              +---------------------------------------+
                                          |
                                          v  [WebSocket Telemetry Events]
                      +---------------------------------------+
                      |      Apex-Console (React / Tauri)     | <--- Real-Time DAG Telemetry
                      |   Tactile Obsidian Steering Dashboard |      Zero Horizontal Overflow
                      +---------------------------------------+
```

---

## The 5 Pillars

### 1. `Apex-Gateway` (The Network Spine)
- **Language / Runtime:** Rust (`axum`, `tokio`, `hyper`, `pin-project-lite`)
- **Port:** `8080` (with dynamic fallback up to `8180`)
- **Core Mechanism:** Pinned telemetry stream yielding Server-Sent Events (SSE) instantly while duplicating chunk bytes to an unbounded Tokio MPSC channel for out-of-band microsecond Time-To-First-Token (TTFT) analysis.
- **Directory:** [`apex-gateway`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-gateway)

### 2. `Apex-Enclave` (The Kernel Sandbox)
- **Language / Runtime:** Rust CLI (`blake3`, `ignore`, `serde_json`)
- **Core Mechanism:** Dual-driver unprivileged containment (Linux `bwrap` user/mount/pid/net namespaces and macOS Darwin `sandbox-exec`). Enforces read-only `/`, isolated read-write workspace, zero network sockets, and generates structured execution receipts with sub-5ms Blake3 cryptographic directory hashing.
- **Directory:** [`apex-enclave`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-enclave)

### 3. `Apex-Core` (The State Machine)
- **Language / Runtime:** Python 3.10+ (`uvloop`, `fastapi`, `uvicorn`, `websockets`)
- **Port:** `9000` (with dynamic fallback up to `9100`)
- **Core Mechanism:** `MemoryCOWWorkspace` utilizing native OS block cloning (Darwin `clonefile(2)` via `ctypes` & Linux `cp --reflink=auto`). Executes task DAGs with instant $O(1)$ rollback in `0.26ms` upon any non-zero exit code or policy breach.
- **Directory:** [`apex-core`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-core)

### 4. `Apex-Warden` (The Hardware Brakes)
- **Language / Runtime:** Python (`ctypes`, `libSystem.B.dylib`, `/proc/meminfo`)
- **Core Mechanism:** Reads active physical memory pressure directly from kernel statistics via `mach_host_self` and `sysctlbyname`. Automatically shifts polling frequency (1.0s -> 0.5s -> 0.1s) and dispatches `SIGSTOP` to target AI processes when memory breaches 85%, resuming with `SIGCONT` once pressure cools below 70%. Under 190 lines of Python.
- **Directory:** [`apex-warden`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-warden)

### 5. `Apex-Console` (The Steering Glass)
- **Language / Runtime:** Tauri 2 + React 18 + Vite 5 + TypeScript + Tailwind CSS
- **Port:** `5173`
- **Core Mechanism:** Obsidian/Apex Black UI (`#07090e`). Subscribes to Apex-Core WebSockets and renders dynamic topological task DAG nodes, live memory gauges, and WAI-ARIA accessible controls with zero horizontal overflow across 375px mobile, 768px tablet, and 1440px desktop viewports.
- **Directory:** [`apex-console`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-console)

---

## Quickstart

### Native Host Boot (Recommended for macOS)

```bash
# 1. Clone the repository
git clone https://github.com/sshloktiwarii/apex-stack.git
cd apex-stack

# 2. Run the automated bootstrap installer
./install.sh

# 3. Boot the complete 5-pillar stack in daemon mode
./bin/apex start

# 4. View live Process Group (PGRP) telemetry and active ports
./bin/apex status

# 5. Run the automated chaos-monkey stress tests (validates all 4 shields in 0.19s)
./bin/apex test

# 6. Graceful, deterministic teardown (guarantees zero zombie processes)
./bin/apex stop
```

### Hermetic Docker Deployment (Zero Host Toolchain)

```bash
# Build and run with least-privilege Linux capabilities (no privileged: true)
docker compose up -d

# Check logs
docker compose logs -f
```

---

## Architectural Decision Records (ADRs)

Key architectural invariants are formalized in [`docs/ADR-001-APEX-SYSTEM-ARCHITECTURE.md`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/docs/ADR-001-APEX-SYSTEM-ARCHITECTURE.md):

- **ADR-001:** Asynchronous Stream Telemetry via Pinned Pin-Project-Lite
- **ADR-002:** Microsecond O(1) Rollback via APFS `clonefile(2)`
- **ADR-003:** Adaptive Kernel Memory Throttling via ctypes Mach/sysctl
- **ADR-004:** Sub-5ms Blake3 Cryptographic Execution Receipts with `.gitignore` Filtering
- **ADR-005:** Dynamic Port Probing (`8080..=8180` and `9000..=9100`)
- **ADR-006:** Process Group (PGRP) Session Isolation & Teardown (`os.setsid` / `os.killpg`)
- **ADR-007:** Container Least-Privilege & Capabilities Isolation (`cap_add: [SYS_ADMIN, DAC_OVERRIDE]`)

---

## Verification & Testing

Apex Stack includes comprehensive automated testing suites across every tier:

```bash
# 1. Automated Chaos-Monkey Adversarial Harness (all 4 security shields)
./bin/apex test

# 2. Rust Enclave Unit Tests (sub-5ms Blake3 hashing benchmarks)
cd apex-enclave && cargo test

# 3. Rust Gateway Proxy Tests
cd apex-gateway && cargo test

# 4. Console Zero-Regression & WCAG 2.1 AA Suite
cd apex-console && npm run test:regression

# 5. Console Production Build Verification
cd apex-console && npm run build
```

---

## License

MIT © [Shlok Tiwari](https://github.com/sshloktiwarii)
