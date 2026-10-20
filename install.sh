#!/bin/sh
set -e

# Apex Stack Universal Bootstrap Installer
# Sets up permissions, verifies dependencies, and initiates first-time setup.

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RESET="\033[0m"

echo "${BOLD}${CYAN}================================================${RESET}"
echo "${BOLD}${CYAN}          APEX STACK BOOTSTRAP INSTALLER        ${RESET}"
echo "${BOLD}${CYAN}================================================${RESET}\n"

OS="$(uname -s)"
ARCH="$(uname -m)"
echo "Detected Platform: ${BOLD}${OS} (${ARCH})${RESET}"

# Check for Python 3
if ! command -v python3 >/dev/null 2>&1; then
    echo "${YELLOW}Warning: python3 is not in PATH. Please install Python 3.10+ or use Docker.${RESET}"
fi

# Ensure bin/apex is executable
chmod +x ./bin/apex

echo "\n${GREEN}✓ Apex CLI is configured.${RESET}"
echo "Run the following command to boot the entire stack:"
echo "\n    ${BOLD}./bin/apex start${RESET}\n"
