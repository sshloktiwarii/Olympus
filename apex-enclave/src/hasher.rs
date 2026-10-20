use ignore::WalkBuilder;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct HashReceipt {
    pub blake3_hash: String,
    pub files_hashed: usize,
    pub bytes_hashed: u64,
    pub duration_ms: f64,
    pub gitignore_detected: bool,
    pub apexignore_detected: bool,
}

/// Computes a Blake3 cryptographic integrity receipt across execution outputs and
/// workspace files, safely excluding ignored patterns (.gitignore, .apexignore, node_modules, target, .git).
/// Execution is optimized for sub-5ms completion.
pub fn compute_workspace_receipt_hash(
    workspace: &Path,
    stdout: &[u8],
    stderr: &[u8],
) -> HashReceipt {
    let start = Instant::now();
    let mut hasher = blake3::Hasher::new();

    // Hash stdout and stderr streams
    hasher.update(b"===STDOUT===");
    hasher.update(stdout);
    hasher.update(b"===STDERR===");
    hasher.update(stderr);

    // Detect .gitignore or .apexignore in workspace root
    let gitignore_detected = workspace.join(".gitignore").is_file();
    let apexignore_detected = workspace.join(".apexignore").is_file();

    let mut builder = WalkBuilder::new(workspace);
    builder
        .hidden(true)
        .parents(false)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(true)
        .require_git(false)
        .add_custom_ignore_filename(".apexignore");

    // Standard exclusion overrides for high-volume binary directories
    let mut override_builder = ignore::overrides::OverrideBuilder::new(workspace);
    let _ = override_builder.add("!node_modules/**");
    let _ = override_builder.add("!node_modules");
    let _ = override_builder.add("!target/**");
    let _ = override_builder.add("!target");
    let _ = override_builder.add("!.git/**");
    let _ = override_builder.add("!.git");

    if let Ok(overrides) = override_builder.build() {
        builder.overrides(overrides);
    }

    let mut files_hashed = 0;
    let mut bytes_hashed = (stdout.len() + stderr.len()) as u64;
    let mut buffer = [0u8; 32768];

    for entry in builder.build().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Ok(rel) = path.strip_prefix(workspace) {
                let rel_str = rel.to_string_lossy();
                let rel_bytes = rel_str.as_bytes();
                hasher.update(&(rel_bytes.len() as u64).to_le_bytes());
                hasher.update(rel_bytes);
            }

            if let Ok(mut file) = File::open(path) {
                while let Ok(n) = file.read(&mut buffer) {
                    if n == 0 {
                        break;
                    }
                    hasher.update(&buffer[..n]);
                    bytes_hashed += n as u64;
                }
                files_hashed += 1;
            }
        }
    }

    let blake3_hash = hasher.finalize().to_hex().to_string();
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    HashReceipt {
        blake3_hash,
        files_hashed,
        bytes_hashed,
        duration_ms,
        gitignore_detected,
        apexignore_detected,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_gitignore_and_apexignore_exclusion() {
        let dir = tempdir().expect("Failed to create tempdir");
        let root = dir.path();

        // Create standard source file
        fs::write(root.join("main.rs"), "fn main() {}").unwrap();

        // Create .gitignore ignoring *.log and dist/
        fs::write(root.join(".gitignore"), "*.log\ndist/\n").unwrap();

        // Create .apexignore ignoring temp_cache/
        fs::write(root.join(".apexignore"), "temp_cache/\n").unwrap();

        // Create ignored files and directories
        fs::write(root.join("test.log"), "some log content").unwrap();

        fs::create_dir_all(root.join("dist")).unwrap();
        fs::write(root.join("dist/bundle.js"), "console.log('bundle')").unwrap();

        fs::create_dir_all(root.join("temp_cache")).unwrap();
        fs::write(root.join("temp_cache/cache.bin"), "cached bytes").unwrap();

        // Create node_modules and target directories
        fs::create_dir_all(root.join("node_modules/lodash")).unwrap();
        fs::write(root.join("node_modules/lodash/index.js"), "module.exports = {}").unwrap();

        fs::create_dir_all(root.join("target/debug")).unwrap();
        fs::write(root.join("target/debug/app"), "binary data").unwrap();

        // Create additional unignored source file
        fs::write(root.join("lib.rs"), "pub fn helper() {}").unwrap();

        let receipt = compute_workspace_receipt_hash(root, b"success", b"");

        assert!(receipt.gitignore_detected);
        assert!(receipt.apexignore_detected);
        // Only main.rs and lib.rs should be hashed!
        // test.log (*.log), dist/, temp_cache/, node_modules/, target/ MUST be excluded.
        assert_eq!(receipt.files_hashed, 2, "Expected exactly 2 unignored files (main.rs, lib.rs)");
        assert!(!receipt.blake3_hash.is_empty());
        assert!(receipt.duration_ms < 5.0, "Hash duration must be under 5ms, took: {}ms", receipt.duration_ms);
    }

    #[test]
    fn test_sub_5ms_performance() {
        let dir = tempdir().expect("Failed to create tempdir");
        let root = dir.path();

        for i in 0..50 {
            fs::write(root.join(format!("file_{}.txt", i)), format!("Payload content {}", i)).unwrap();
        }

        let receipt = compute_workspace_receipt_hash(root, b"done", b"");
        assert_eq!(receipt.files_hashed, 50);
        assert!(receipt.duration_ms < 5.0, "Took: {}ms (expected < 5ms)", receipt.duration_ms);
    }
}
