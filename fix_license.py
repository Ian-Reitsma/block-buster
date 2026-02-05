#!/usr/bin/env python3
"""Remove license blocking from block-buster."""

import re

def fix_api_py():
    """Fix api.py to make wallet optional."""
    file_path = "src/block_buster/server/api.py"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Replace check_license function
    old_func = r"""    @app.on_event\("startup"\)
    async def check_license\(\) -> None:
        mode = lm\.license_mode\(cfg\.wallet\) if cfg\.wallet else "none"
        if mode == "none":
            raise RuntimeError\("wallet lacks license token"\)
        if mode == "demo":
            logging\.warning\("Demo mode active: trading disabled"\)"""
    
    new_func = """    @app.on_event("startup")
    async def initialize() -> None:
        # Wallet connection is now optional - users can connect later via UI
        # No license required to use the monitoring dashboard
        if cfg.wallet:
            mode = lm.license_mode(cfg.wallet)
            logging.info(f"Wallet connected: {cfg.wallet} (mode: {mode})")
        else:
            logging.info("No wallet connected - monitoring mode only")"""
    
    content = re.sub(old_func, new_func, content)
    
    # Add wallet_status endpoint
    license_endpoint = r"""    @app\.get\("/license", response_model=LicenseInfo\)
    def license_info\(\) -> LicenseInfo:
        now = int\(time\.time\(\)\)
        return LicenseInfo\(
            wallet=cfg\.wallet or "",
            mode=lm\.license_mode\(cfg\.wallet\) if cfg\.wallet else "none",
            issued_at=now,
            expires_at=now \+ 30 \* 24 \* 3600,
        \)"""
    
    new_endpoints = """    @app.get("/wallet/status")
    def wallet_status() -> dict:
        \"\"\"Get current wallet connection status (optional - no wallet required).\"\"\"  
        now = int(time.time())
        return {
            "wallet": cfg.wallet or None,
            "connected": cfg.wallet is not None,
            "mode": lm.license_mode(cfg.wallet) if cfg.wallet else "none",
            "timestamp": now
        }
    
    @app.get("/license", deprecated=True)
    def license_info() -> dict:
        \"\"\"Deprecated: Use /wallet/status instead.\"\"\"  
        return wallet_status()"""
    
    content = re.sub(license_endpoint, new_endpoints, content)
    
    # Update /state endpoint to use wallet_status
    old_state = """        lic = license_info()
        return {
            "running": runtime_state["running"],
            "emergency_stop": runtime_state["emergency_stop"],
            "settings": runtime_state["settings"],
            "mode": runtime_state["mode"],
            "paper": runtime_state["paper"],
            "license": lic,"""
    
    new_state = """        wallet_info = wallet_status()
        return {
            "running": runtime_state["running"],
            "emergency_stop": runtime_state["emergency_stop"],
            "settings": runtime_state["settings"],
            "mode": runtime_state["mode"],
            "paper": runtime_state["paper"],
            "wallet": wallet_info,"""
    
    content = content.replace(old_state, new_state)
    
    # Write back
    with open(file_path, 'w') as f:
        f.write(content)
    
    print(f"✅ Updated {file_path}")

def fix_main_py():
    """Fix main.py to make wallet optional."""
    file_path = "src/main.py"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Replace license check
    old_check = """    lm = LicenseManager(rpc_http=cfg.rpc_http)
    if not cfg.wallet:
        print("--wallet is required")
        return
    mode = lm.verify_or_exit(cfg.wallet)
    if mode == "demo":
        logging.warning("Demo mode active: trading disabled")"""
    
    new_check = """    lm = LicenseManager(rpc_http=cfg.rpc_http)
    if cfg.wallet:
        mode = lm.license_mode(cfg.wallet)
        logging.info(f"Wallet mode: {mode}")
    else:
        logging.info("Running without wallet - monitoring only")"""
    
    content = content.replace(old_check, new_check)
    
    with open(file_path, 'w') as f:
        f.write(content)
    
    print(f"✅ Updated {file_path}")

def fix_license_py():
    """Update license.py to deprecate verify_or_exit."""
    file_path = "src/block_buster/utils/license.py"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Update verify_or_exit
    old_method = """    def verify_or_exit(self, wallet: str) -> str:
        \"\"\"Ensure ``wallet`` has a license, exiting the process if not.\"\"\"
        mode = self.license_mode(wallet)
        if mode == "none":
            import sys

            print(
                "License check failed. Obtain a license token from the authority wallet."
            )
            sys.exit(1)
        return mode"""
    
    new_method = """    def verify_or_exit(self, wallet: str) -> str:
        \"\"\"DEPRECATED: Use license_mode() instead - wallet connection is now optional.
        
        This method no longer exits on missing license. Wallet connection is optional
        and users can connect their wallet later via the UI.
        \"\"\"
        import logging
        logging.warning("verify_or_exit is deprecated - wallet connection is now optional")
        return self.license_mode(wallet)"""
    
    content = content.replace(old_method, new_method)
    
    with open(file_path, 'w') as f:
        f.write(content)
    
    print(f"✅ Updated {file_path}")

if __name__ == "__main__":
    print("🔧 Removing license blocking from block-buster...\n")
    
    try:
        fix_api_py()
        fix_main_py()
        fix_license_py()
        print("\n✨ All files updated successfully!")
        print("\n📝 Changes made:")
        print("  - Wallet connection is now optional")
        print("  - Dashboard works without wallet (monitoring mode)")
        print("  - Users can connect wallet later via UI")
        print("  - /wallet/status endpoint added")
        print("  - verify_or_exit() deprecated")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
