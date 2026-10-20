# Apex Stack — Plain-English Guide

## What is Apex Stack?

Apex Stack is a **bulletproof runtime and safety cage for autonomous AI coding agents**.

When you allow an AI agent (like Claude Code, AutoGPT, or an autonomous LLM workflow) to edit files and execute terminal commands on your computer, you are giving an unpredictable program root-level control over your operating system. A single hallucinated command can delete your personal documents, install unwanted software, hog all your computer's RAM, or lock up your network ports.

Apex Stack acts like an armored cockpit for AI agents. It gives the agent a restricted sandbox to work in, an emergency brake pedal if memory gets dangerously high, and an instant "undo" button that restores your files in a fraction of a millisecond.

---

## Why is this needed?

AI models are probabilistic. Even the best models make mistakes. 

1. **Destructive Commands:** An agent trying to clean up temporary files might accidentally execute `rm -rf /` or overwrite important source code.
2. **System Freezes:** Local AI models (like Ollama or vLLM) can easily spike your computer's RAM to 100%, causing your entire operating system to freeze and forcing a hard reboot.
3. **Ghost Processes & Port Lockups:** When you stop an agent by hitting `Ctrl+C`, background tasks often keep running as invisible "zombie" processes, holding ports like `8080` hostage and preventing you from restarting your tools.

Apex Stack solves all three problems at the operating system and kernel level.

---

## The 5 Shields in Plain English

Apex Stack divides protection into 5 specialized layers:

### 1. Apex-Gateway (The Network Guard)
- **What it is:** An ultra-fast proxy server written in Rust.
- **Analogy:** A security checkpoint at an airport.
- **How it works:** When your software requests a completion from an AI model, the request passes through the Gateway first. It streams responses back to you instantly with zero lag, while tracking your response speed (Time-To-First-Token) in microseconds out-of-band.

### 2. Apex-Enclave (The Bulletproof Sandbox)
- **What it is:** A lightweight sandbox runner written in Rust.
- **Analogy:** A bomb squad containment chamber.
- **How it works:** When the AI agent needs to run a bash command or write code, it runs inside Enclave. The agent has read-only access to system files, isolated workspace boundaries, and zero network access. Before and after execution, Enclave creates a cryptographic "receipt" (a Blake3 hash in 0.35 milliseconds) proving exactly what changed.

### 3. Apex-Core (The Instant Undo Button)
- **What it is:** A state-machine and file snapshot engine written in Python.
- **Analogy:** A video game save-point right before a boss fight.
- **How it works:** Before any task runs, Apex-Core uses native operating system block cloning (macOS APFS `clonefile` or Linux `reflink`) to take a snapshot of your workspace in **0.15ms** using **zero extra disk space**. If the agent fails or corrupts a file, Apex-Core rolls your entire folder back to the pristine snapshot in **0.26ms**.

### 4. Apex-Warden (The Emergency Brake Pedal)
- **What it is:** A tiny hardware monitor (under 200 lines of Python) that talks directly to your computer's kernel via C-libraries.
- **Analogy:** An automatic emergency brake in a self-driving car.
- **How it works:** Warden checks your computer's real physical RAM pressure every second. If memory pressure spikes above 85%, Warden immediately sends an operating system `SIGSTOP` signal to pause the AI processes before your machine crashes. Once your RAM cools down below 70%, Warden sends `SIGCONT` to smoothly resume work.

### 5. Apex-Console (The Steering Glass)
- **What it is:** A sleek, dark-mode desktop dashboard built with React and Tauri.
- **Analogy:** The instrument cluster on a sports car.
- **How it works:** It connects to Apex-Core via WebSockets and gives you a visual dashboard of active tasks, real-time memory meters, and one-click rollback controls without needing to decipher terminal logs.

---

## How to Run It in One Command

You don't need to open five separate terminal tabs to start Apex Stack.

```bash
# 1. Clone the repository and enter the directory
git clone https://github.com/sshloktiwarii/apex-stack.git
cd apex-stack

# 2. Run the automated bootstrap installer
./install.sh

# 3. Start the entire 5-pillar ecosystem
./bin/apex start
```

### Useful Commands:
- `./bin/apex status` — View the live health, Process Groups (PGRP), and ports of all services.
- `./bin/apex test` — Run the automated chaos-monkey stress test (proves all 4 defense shields work under simulated attack in 0.19 seconds).
- `./bin/apex stop` — Cleanly terminates all background processes without leaving any orphan zombies.

### Running with Docker (Zero Dependencies):
```bash
docker compose up -d
```

---

## What is it built with?

- **Rust** (`axum`, `tokio`, `hyper`, `blake3`) — High-performance L7 proxy and sub-millisecond cryptographic sandboxing.
- **Python 3.10+** (`fastapi`, `uvloop`, `ctypes`) — State management, APFS/reflink block cloning, and kernel memory telemetry.
- **React 18 & TypeScript** (`vite`, `tailwindcss`, `tauri 2`) — Responsive, keyboard-accessible dashboard.
- **Docker & Bubblewrap (`bwrap`)** — Unprivileged Linux namespace containment.

---

## Who is it for?

Developers, researchers, and students running autonomous AI coding tools who want the freedom to let agents execute code locally without the constant anxiety of a destroyed filesystem, frozen computer, or leaked ports.
