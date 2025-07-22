#!/bin/bash
set -e

# gateway-cli Install Script - Downloads pre-compiled binaries and handles upgrades

REPO="contextvm/gateway-cli"
BINARY_NAME="gateway-cli"
FORCE_INSTALL=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Detect operating system and architecture
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            OS="macos"
            ;;
        Linux*)
            OS="linux"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            ;;
    esac

    # Detect architecture
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64)
            ARCH="x86_64"
            ;;
        aarch64|arm64)
            ARCH="aarch64"
            ;;
        *)
            print_warning "Unknown architecture: $ARCH, using x86_64 as fallback"
            ARCH="x86_64"
            ;;
    esac

    print_info "Detected OS: $OS"
    print_info "Detected architecture: $ARCH"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if gateway-cli is already installed and get version
check_existing_installation() {
    if command_exists gateway-cli; then
        INSTALLED_PATH=$(which gateway-cli)
        INSTALLED_VERSION=$(gateway-cli --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        print_info "Found existing gateway-cli installation at: $INSTALLED_PATH"
        print_info "Installed version: $INSTALLED_VERSION"
        return 0
    else
        return 1
    fi
}

# Prompt user for yes/no question
prompt_yes_no() {
    local prompt="$1"
    local response

    # Check if stdin is a terminal
    if [ ! -t 0 ]; then
        # We're being piped, so we need to read from the controlling terminal
        if [ -e /dev/tty ]; then
            exec < /dev/tty
        else
            print_warning "Cannot prompt for input when running non-interactively"
            print_info "Keeping existing installation"
            return 1
        fi
    fi

    while true; do
        read -p "$prompt (y/n): " response
        case $response in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer yes (y) or no (n).";;
        esac
    done
}

# Handle other installation paths
handle_other_installations() {
    local expected_path="$1"
    local current_path="$2"

    # Normalize paths by removing trailing slashes
    expected_path="${expected_path%/}"
    current_path="${current_path%/}"

    # Check if the current installation is in a different location
    if [ "$current_path" != "$expected_path/$BINARY_NAME" ] && [ "$current_path" != "$expected_path/gateway-cli.exe" ]; then
        print_warning "Found gateway-cli installed at: $current_path"
        print_warning "This installation is not managed by this install script."
        print_info "This script installs to: $expected_path"

        echo ""
        if prompt_yes_no "Would you like to remove the installation at $current_path?"; then
            print_info "Removing $current_path..."
            if [ -w "$(dirname "$current_path")" ]; then
                rm -f "$current_path"
            else
                print_info "Administrator access required to remove $current_path"
                sudo rm -f "$current_path"
            fi
            print_success "Removed installation at $current_path"
            return 0
        else
            print_warning "Keeping existing installation at $current_path"
            print_warning "This may cause PATH conflicts. The first gateway-cli in your PATH will be used."
            return 1
        fi
    fi
    return 0
}

# Compare semantic versions
# Returns 0 if version1 > version2, 1 if version1 < version2, 2 if equal
compare_versions() {
    local version1=$1
    local version2=$2

    # Remove 'v' prefix if present
    version1=${version1#v}
    version2=${version2#v}

    if [[ "$version1" == "$version2" ]]; then
        return 2
    fi

    # Split versions into parts
    IFS='.' read -ra V1 <<< "$version1"
    IFS='.' read -ra V2 <<< "$version2"

    # Compare major, minor, patch
    for i in 0 1 2; do
        local v1=${V1[$i]:-0}
        local v2=${V2[$i]:-0}

        if [[ $v1 -gt $v2 ]]; then
            return 0
        elif [[ $v1 -lt $v2 ]]; then
            return 1
        fi
    done

    return 2
}

# Get latest release info from GitHub
get_latest_release() {
    print_info "Fetching latest release information..."

    if command_exists curl; then
        LATEST_RELEASE=$(curl -s https://api.github.com/repos/$REPO/releases/latest)
    elif command_exists wget; then
        LATEST_RELEASE=$(wget -qO- https://api.github.com/repos/$REPO/releases/latest)
    else
        print_error "Neither curl nor wget found. Please install curl or wget and try again."
    fi

    VERSION=$(echo "$LATEST_RELEASE" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$VERSION" ]; then
        print_error "Could not determine latest version. Please check your internet connection."
    fi

    print_info "Latest version: $VERSION"
}

# Download and install/upgrade binary
install_binary() {
    local is_upgrade=false
    local backup_path=""

    # Determine binary name and install directory based on OS
    case "$OS" in
        macos)
            BINARY_NAME="gateway-cli-macos-${VERSION#v}"
            DOWNLOAD_FILE="gateway-cli-macos"
            INSTALL_DIR="/usr/local/bin"
            ;;
        linux)
            BINARY_NAME="gateway-cli-linux-${VERSION#v}"
            DOWNLOAD_FILE="gateway-cli-linux"
            INSTALL_DIR="/usr/local/bin"
            ;;
        windows)
            BINARY_NAME="gateway-cli-windows-${VERSION#v}.exe"
            DOWNLOAD_FILE="gateway-cli-windows"
            INSTALL_DIR="$HOME/bin"
            OUTPUT_FILE="gateway-cli-windows.exe"
            ;;
    esac

    BINARY_URL="https://github.com/$REPO/releases/download/$VERSION/$BINARY_NAME"

    # Check if this is an upgrade
    if [ -f "$INSTALL_DIR/$DOWNLOAD_FILE" ]; then
        is_upgrade=true
        backup_path="$INSTALL_DIR/${DOWNLOAD_FILE}.backup"
        print_info "Creating backup of existing binary at $backup_path"
    fi

    print_info "Downloading gateway-cli $VERSION..."

    # Create temp file
    TEMP_FILE=$(mktemp)

    # Download binary
    if command_exists curl; then
        curl -L -o "$TEMP_FILE" "$BINARY_URL" || print_error "Download failed"
    elif command_exists wget; then
        wget -O "$TEMP_FILE" "$BINARY_URL" || print_error "Download failed"
    fi

    # Make executable (Linux/macOS only)
    if [ "$OS" != "windows" ]; then
        chmod +x "$TEMP_FILE"
    fi

    # Test the downloaded binary
    if [ "$OS" != "windows" ]; then
        if ! "$TEMP_FILE" --version >/dev/null 2>&1; then
            print_error "Downloaded binary appears to be corrupted or incompatible"
        fi
    fi

    # Backup existing binary if upgrading
    if [ "$is_upgrade" = true ]; then
        if [ "$OS" != "windows" ]; then
            if [ -w "$INSTALL_DIR" ]; then
                cp "$INSTALL_DIR/$DOWNLOAD_FILE" "$backup_path"
            else
                sudo cp "$INSTALL_DIR/$DOWNLOAD_FILE" "$backup_path"
            fi
        else
            cp "$INSTALL_DIR/${OUTPUT_FILE}" "$backup_path"
        fi
    fi

    # Install the new binary
    if [ "$OS" != "windows" ]; then
        if [ -w "$INSTALL_DIR" ]; then
            mv "$TEMP_FILE" "$INSTALL_DIR/$DOWNLOAD_FILE"
        else
            print_info "Administrator access required to install to $INSTALL_DIR"
            sudo mv "$TEMP_FILE" "$INSTALL_DIR/$DOWNLOAD_FILE"
            sudo ln -sf "$INSTALL_DIR/$DOWNLOAD_FILE" "$INSTALL_DIR/gateway-cli" 2>/dev/null || true
        fi
    else
        # Windows
        mkdir -p "$INSTALL_DIR"
        mv "$TEMP_FILE" "$INSTALL_DIR/${OUTPUT_FILE}"
        # Add symlink for gateway-cli
        if command_exists powershell; then
            powershell -Command "New-Item -ItemType SymbolicLink -Path '$INSTALL_DIR\\gateway-cli.exe' -Target '$INSTALL_DIR\\${OUTPUT_FILE}' -Force" 2>/dev/null || true
        fi
    fi

    # Clean up backup if installation was successful
    if [ "$is_upgrade" = true ] && "$INSTALL_DIR/$DOWNLOAD_FILE" --version >/dev/null 2>&1; then
        print_info "Upgrade successful, removing backup"
        if [ "$OS" != "windows" ]; then
            if [ -w "$INSTALL_DIR" ]; then
                rm -f "$backup_path"
            else
                sudo rm -f "$backup_path"
            fi
        else
            rm -f "$backup_path"
        fi
    elif [ "$is_upgrade" = true ]; then
        # Restore backup if something went wrong
        print_warning "Installation verification failed, restoring backup"
        if [ "$OS" != "windows" ]; then
            if [ -w "$INSTALL_DIR" ]; then
                mv "$backup_path" "$INSTALL_DIR/$DOWNLOAD_FILE"
            else
                sudo mv "$backup_path" "$INSTALL_DIR/$DOWNLOAD_FILE"
            fi
        else
            mv "$backup_path" "$INSTALL_DIR/${OUTPUT_FILE}"
        fi
        print_error "Upgrade failed, previous version restored"
    fi

    # Create symlink on Linux/macOS for convenience
    if [ "$OS" != "windows" ]; then
        if [ -w "$INSTALL_DIR" ]; then
            ln -sf "$INSTALL_DIR/$DOWNLOAD_FILE" "$INSTALL_DIR/gateway-cli" 2>/dev/null || true
        else
            sudo ln -sf "$INSTALL_DIR/$DOWNLOAD_FILE" "$INSTALL_DIR/gateway-cli" 2>/dev/null || true
        fi
    fi

    if [ "$is_upgrade" = true ]; then
        print_success "gateway-cli upgraded successfully to $VERSION"
    else
        print_success "gateway-cli $VERSION installed successfully to $INSTALL_DIR/$DOWNLOAD_FILE"
    fi

    # Add to PATH instructions for Windows
    if [ "$OS" = "windows" ] && [ "$is_upgrade" = false ]; then
        print_info "Add $INSTALL_DIR to your PATH to use gateway-cli from anywhere"
    fi
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                FORCE_INSTALL=true
                shift
                ;;
            -h|--help)
                echo "gateway-cli Install Script"
                echo ""
                echo "Usage: install.sh [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  -f, --force       Force installation even if version is already up to date"
                echo "  -h, --help        Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                ;;
        esac
    done
}

# Main installation logic
main() {
    echo "🚀 gateway-cli Install Script"
    echo "============================"
    echo ""

    # Parse command line arguments
    parse_args "$@"

    detect_os

    # Determine expected install directory based on OS
    case "$OS" in
        macos|linux)
            EXPECTED_INSTALL_DIR="/usr/local/bin"
            INSTALL_DIR="/usr/local/bin"
            ;;
        windows)
            EXPECTED_INSTALL_DIR="$HOME/bin"
            INSTALL_DIR="$HOME/bin"
            ;;
    esac

    # Check for existing installation
    if check_existing_installation; then
        # Handle installations in other locations
        handle_other_installations "$EXPECTED_INSTALL_DIR" "$INSTALLED_PATH"

        get_latest_release

        # Compare versions
        compare_versions "${VERSION#v}" "${INSTALLED_VERSION#v}"
        local comparison_result=$?

        if [ $comparison_result -eq 2 ] && [ "$FORCE_INSTALL" = false ]; then
            print_success "gateway-cli is already up to date (version $INSTALLED_VERSION)"
            print_info "Use --force to reinstall anyway"
            exit 0
        elif [ $comparison_result -eq 1 ] && [ "$FORCE_INSTALL" = false ]; then
            print_warning "Installed version ($INSTALLED_VERSION) is newer than latest release ($VERSION)"
            print_info "Use --force to downgrade"
            exit 0
        elif [ $comparison_result -eq 0 ]; then
            print_info "New version available: $VERSION (current: $INSTALLED_VERSION)"
            print_info "Proceeding with upgrade..."
        elif [ "$FORCE_INSTALL" = true ]; then
            print_info "Force installing version $VERSION..."
        fi
    else
        print_info "No existing installation found"
        get_latest_release
        print_info "Installing gateway-cli $VERSION..."
    fi

    install_binary

    echo ""
    # Save the previous version before checking new installation
    local prev_version="$INSTALLED_VERSION"
    local was_installed=false
    if check_existing_installation >/dev/null 2>&1; then
        was_installed=true
    fi

    # Determine which binary file to test based on OS
    case "$OS" in
        macos)
            TEST_FILE="/usr/local/bin/gateway-cli-macos"
            ;;
        linux)
            TEST_FILE="/usr/local/bin/gateway-cli-linux"
            ;;
        windows)
            TEST_FILE="$HOME/bin/gateway-cli-windows.exe"
            ;;
    esac

    # Verify the installation by checking the specific binary we just installed
    if [ -f "$TEST_FILE" ] && "$TEST_FILE" --version >/dev/null 2>&1; then
        local new_version=$("$TEST_FILE" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")

        if [ "$was_installed" = true ] && [ "$prev_version" != "${new_version#v}" ]; then
            print_success "Upgrade complete!"
            print_info "gateway-cli has been upgraded from $prev_version to ${new_version#v}"
        else
            print_success "Installation complete!"
        fi

        print_info "Run 'gateway-cli --version' to verify the installation"

        # Only show help message for new installations
        if [ "$was_installed" = false ]; then
            print_info "Run 'gateway-cli --help' to get started"
        fi
    else
        print_error "Installation verification failed"
    fi
}

# Run main function
main "$@"