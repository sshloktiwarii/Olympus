# Apex Stack: High-Performance Local Autonomous Agent Infrastructure

The Apex Stack is a five-tier distributed architecture engineered for autonomous AI execution, kernel isolation, memory protection, and neural steering.

---

## The 5 Pillars of the Apex Stack

### 1. `Apex-Gateway` (The Network Spine)
- **Language / Runtime:** Rust (`axum`, `tokio`, `hyper`, `pin-project-lite`)
- **Port:** `8080` (`/v1/chat/completions`)
- **Core Mechanism:** Zero-blocking pinned telemetry stream yielding SSE chunks instantly while cloning bytes to an unbounded Tokio MPSC channel for out-of-band microsecond Time-To-First-Token (TTFT) tracking.
- **Location:** [`apex-stack/apex-gateway`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-gateway)

### 2. `Apex-Enclave` (The Kernel Sandbox)
- **Language / Runtime:** Rust CLI (`blake3`, `serde_json`)
- **Core Mechanism:** Dual-driver unprivileged containment (Linux `bwrap` user/mount/pid/net namespaces + macOS Darwin `sandbox-exec`). Read-only `/`, isolated read-write workspace, zero network access, and structured JSON execution receipts with Blake3 cryptographic hashes.
- **Location:** [`apex-stack/apex-enclave`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-enclave)

### 3. `Apex-Core` (The State Machine)
- **Language / Runtime:** Python 3.10+ (`uvloop`, `fastapi`, `uvicorn`, `websockets`)
- **Port:** `9000` (REST & WebSockets)
- **Core Mechanism:** `MemoryCOWWorkspace` with native OS block cloning (Darwin `clonefile(2)` via `ctypes` & Linux `cp --reflink=auto`). Runs tasks topologically with instant $O(1)$ rollback upon non-zero process exits.
- **Location:** [`apex-stack/apex-core`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-core)

### 4. `Apex-Warden` (The Hardware Brakes)
- **Language / Runtime:** Python (`ctypes`, `libSystem.B.dylib`, `/proc/meminfo`)
- **Core Mechanism:** Reads active physical memory pressure and total RAM capacity every 1000ms. Sends `SIGSTOP` to target processes (`ollama`, `vllm`, `python`) when memory pressure breaches 85%, and unfreezes with `SIGCONT` when pressure drops below 70%. Under 160 lines of clean Python.
- **Location:** [`apex-stack/apex-warden`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-warden)

### 5. `Apex-Console` (The Glass)
- **Language / Runtime:** Tauri + React + Vite + TypeScript + Tailwind CSS
- **Port:** `5173`
- **Core Mechanism:** Obsidian/Apex Black UI (`#07090e`). Listens to Apex-Core WebSockets and renders dynamic execution DAG nodes:
  - **Gray:** Pending
  - **Blue:** Running
  - **Green:** Success
  - **Red:** Failed
  - **Yellow:** Rolled Back
- **Location:** [`apex-stack/apex-console`](file:///Users/shloktiwari/Documents/untitled%20folder/apex-stack/apex-console)
