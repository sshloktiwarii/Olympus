use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EnclaveError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("No supported sandbox driver found on host system (requires bwrap on Linux or sandbox-exec on macOS)")]
    NoDriverFound,
    #[error("Profile compilation error: {0}")]
    ProfileError(String),
}

pub struct ExecutionResult {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: i32,
}

pub trait SandboxDriver {
    fn execute(
        &self,
        command: &str,
        args: &[String],
        workspace: &Path,
    ) -> Result<ExecutionResult, EnclaveError>;
}

/// macOS Seatbelt driver using sandbox-exec with zero network and read-only host root
pub struct DarwinSeatbeltDriver;

impl DarwinSeatbeltDriver {
    fn generate_profile(workspace: &Path) -> String {
        let ws_str = workspace.to_string_lossy();
        format!(
            r#"(version 1)
(deny default)
(deny network*)
(allow process-exec)
(allow process-fork)
(allow sysctl-read)
(allow file-read* (subpath "/"))
(allow file-read-metadata)
(allow file-read* file-write* (subpath "{ws_str}"))
(allow file-read* file-write* (subpath "/dev/null"))
(allow file-read* file-write* (subpath "/dev/zero"))
(allow file-read* file-write* (subpath "/dev/urandom"))
(allow file-read* file-write* (subpath "/dev/dtracehelper"))
"#
        )
    }
}

impl SandboxDriver for DarwinSeatbeltDriver {
    fn execute(
        &self,
        command: &str,
        args: &[String],
        workspace: &Path,
    ) -> Result<ExecutionResult, EnclaveError> {
        let profile = Self::generate_profile(workspace);

        let mut cmd = Command::new("/usr/bin/sandbox-exec");
        cmd.arg("-p").arg(profile);
        cmd.arg(command);
        cmd.args(args);
        cmd.current_dir(workspace);

        let output: Output = cmd.output()?;

        Ok(ExecutionResult {
            stdout: output.stdout,
            stderr: output.stderr,
            exit_code: output.status.code().unwrap_or(-1),
        })
    }
}

/// Linux Bubblewrap driver enforcing unprivileged namespaces, read-only root, and zero network
pub struct LinuxBubblewrapDriver;

impl SandboxDriver for LinuxBubblewrapDriver {
    fn execute(
        &self,
        command: &str,
        args: &[String],
        workspace: &Path,
    ) -> Result<ExecutionResult, EnclaveError> {
        let mut cmd = Command::new("bwrap");

        // Unprivileged namespace flags
        cmd.arg("--unshare-user")
            .arg("--unshare-pid")
            .arg("--unshare-net")
            .arg("--unshare-ipc")
            .arg("--unshare-uts")
            .arg("--die-with-parent");

        // Read-only system root mounts
        cmd.arg("--ro-bind").arg("/usr").arg("/usr")
            .arg("--ro-bind").arg("/lib").arg("/lib")
            .arg("--ro-bind").arg("/bin").arg("/bin")
            .arg("--ro-bind").arg("/sbin").arg("/sbin")
            .arg("--ro-bind-try").arg("/etc").arg("/etc")
            .arg("--ro-bind-try").arg("/lib64").arg("/lib64")
            .arg("--proc").arg("/proc")
            .arg("--dev").arg("/dev")
            .arg("--tmpfs").arg("/tmp");

        // Writable isolated workspace mount
        cmd.arg("--bind").arg(workspace).arg(workspace);
        cmd.current_dir(workspace);

        cmd.arg("--").arg(command);
        cmd.args(args);

        let output: Output = cmd.output()?;

        Ok(ExecutionResult {
            stdout: output.stdout,
            stderr: output.stderr,
            exit_code: output.status.code().unwrap_or(-1),
        })
    }
}

pub fn detect_driver() -> Result<Box<dyn SandboxDriver>, EnclaveError> {
    if cfg!(target_os = "macos") {
        if PathBuf::from("/usr/bin/sandbox-exec").exists() {
            return Ok(Box::new(DarwinSeatbeltDriver));
        }
    } else if cfg!(target_os = "linux") {
        if which::which("bwrap").is_ok() {
            return Ok(Box::new(LinuxBubblewrapDriver));
        }
    }

    Err(EnclaveError::NoDriverFound)
}
