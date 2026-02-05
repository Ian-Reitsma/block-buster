#!/usr/bin/env python3
"""Fix api.py to remove license blocking."""

file_path = "src/block_buster/server/api.py"

with open(file_path, 'r') as f:
    content = f.read()

# Fix 1: Replace check_license function
old_startup = '''    @app.on_event("startup")
    async def check_license() -> None:
        mode = lm.license_mode(cfg.wallet) if cfg.wallet else "none"
        if mode == "none":
            raise RuntimeError("wallet lacks license token")
        if mode == "demo":
            logging.warning("Demo mode active: trading disabled")'''

new_startup = '''    @app.on_event("startup")
    async def initialize() -> None:
        # Wallet connection is now optional - users can connect later via UI
        # No license required to use the monitoring dashboard
        if cfg.wallet:
            mode = lm.license_mode(cfg.wallet)
            logging.info(f"Wallet connected: {cfg.wallet} (mode: {mode})")
        else:
            logging.info("No wallet connected - monitoring mode only")'''

content = content.replace(old_startup, new_startup)

# Fix 2: Add wallet_status and update license endpoint
old_license = '''    @app.get("/license", response_model=LicenseInfo)
    def license_info() -> LicenseInfo:
        now = int(time.time())
        return LicenseInfo(
            wallet=cfg.wallet or "",
            mode=lm.license_mode(cfg.wallet) if cfg.wallet else "none",
            issued_at=now,
            expires_at=now + 30 * 24 * 3600,
        )'''

new_license = '''    @app.get("/wallet/status")
    def wallet_status() -> dict:
        """Get current wallet connection status (optional - no wallet required)."""  
        now = int(time.time())
        return {
            "wallet": cfg.wallet or None,
            "connected": cfg.wallet is not None,
            "mode": lm.license_mode(cfg.wallet) if cfg.wallet else "none",
            "timestamp": now
        }
    
    @app.get("/license", deprecated=True)
    def license_info() -> dict:
        """Deprecated: Use /wallet/status instead."""  
        return wallet_status()'''

content = content.replace(old_license, new_license)

# Fix 3: Update /state endpoint
old_state_line = '''        lic = license_info()'''
new_state_line = '''        wallet_info = wallet_status()'''
content = content.replace(old_state_line, new_state_line)

old_lic_field = '''            "license": lic,'''
new_wallet_field = '''            "wallet": wallet_info,'''
content = content.replace(old_lic_field, new_wallet_field)

# Write back
with open(file_path, 'w') as f:
    f.write(content)

print("✅ Updated src/block_buster/server/api.py")
print("  - Removed license blocking at startup")
print("  - Added /wallet/status endpoint")
print("  - Deprecated /license endpoint")
print("  - Updated /state to use wallet_status()")
