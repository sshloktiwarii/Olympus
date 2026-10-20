mod drivers;
mod hasher;

use drivers::detect_driver;
use hasher::compute_workspace_receipt_hash;
use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::process::exit;

#[derive(Serialize)]
pub struct ExecutionReceipt {
    pub success: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub blake3_hash: String,
    pub driver_used: String,
    pub workspace: String,
    pub files_hashed: usize,
    pub bytes_hashed: u64,
    pub hash_duration_ms: f64,
    pub gitignore_detected: bool,
    pub apexignore_detected: bool,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: apex-enclave [--workspace <dir>] <command> [args...]");
        exit(1);
    }

    let mut workspace = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut cmd_start_idx = 1;

    if args[1] == "--workspace" && args.len() > 3 {
        workspace = PathBuf::from(&args[2]);
        cmd_start_idx = 3;
    }

    let command = &args[cmd_start_idx];
    let cmd_args: Vec<String> = args[cmd_start_idx + 1..].to_vec();

    let driver = match detect_driver() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Fatal Enclave Error: {}", e);
            exit(2);
        }
    };

    let driver_name = if cfg!(target_os = "macos") {
        "macos-sandbox-exec"
    } else {
        "linux-bwrap"
    };

    let result = match driver.execute(command, &cmd_args, &workspace) {
        Ok(res) => res,
        Err(e) => {
            let hash_receipt = compute_workspace_receipt_hash(&workspace, b"", e.to_string().as_bytes());
            let receipt = ExecutionReceipt {
                success: false,
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Sandbox driver execution failure: {}", e),
                blake3_hash: hash_receipt.blake3_hash,
                driver_used: driver_name.to_string(),
                workspace: workspace.to_string_lossy().to_string(),
                files_hashed: hash_receipt.files_hashed,
                bytes_hashed: hash_receipt.bytes_hashed,
                hash_duration_ms: hash_receipt.duration_ms,
                gitignore_detected: hash_receipt.gitignore_detected,
                apexignore_detected: hash_receipt.apexignore_detected,
            };
            println!("{}", serde_json::to_string_pretty(&receipt).unwrap());
            exit(1);
        }
    };

    // Calculate Blake3 cryptographic receipt hash across outputs and workspace with ignore rules
    let hash_receipt = compute_workspace_receipt_hash(&workspace, &result.stdout, &result.stderr);

    let receipt = ExecutionReceipt {
        success: result.exit_code == 0,
        exit_code: result.exit_code,
        stdout: String::from_utf8_lossy(&result.stdout).to_string(),
        stderr: String::from_utf8_lossy(&result.stderr).to_string(),
        blake3_hash: hash_receipt.blake3_hash,
        driver_used: driver_name.to_string(),
        workspace: workspace.to_string_lossy().to_string(),
        files_hashed: hash_receipt.files_hashed,
        bytes_hashed: hash_receipt.bytes_hashed,
        hash_duration_ms: hash_receipt.duration_ms,
        gitignore_detected: hash_receipt.gitignore_detected,
        apexignore_detected: hash_receipt.apexignore_detected,
    };

    println!("{}", serde_json::to_string_pretty(&receipt).unwrap());

    if !receipt.success {
        exit(result.exit_code);
    }
}
