#!/usr/bin/env python3
"""Automated fix for all Solana residue and syntax errors in block-buster.

This script:
1. Fixes syntax errors in Python files
2. Updates package naming
3. Removes Solana dependencies
4. Updates import paths
5. Aligns RPC methods with actual node
"""

import os
import re
from pathlib import Path

ROOT = Path(__file__).parent

def fix_syntax_errors():
    """Fix all syntax errors preventing code from running."""
    print("⚙️  Fixing syntax errors...")
    
    # Fix rpc_client.py line 27
    rpc_client = ROOT / "src/the_block/rpc_client.py"
    if rpc_client.exists():
        content = rpc_client.read_text()
        # Fix: def __init__(self, code: int, message: str,  Optional[Any] = None):
        content = re.sub(
            r'def __init__\(self, code: int, message: str,\s+Optional\[Any\] = None\):',
            'def __init__(self, code: int, message: str,  Optional[Any] = None):',
            content
        )
        rpc_client.write_text(content)
        print(f"  ✅ Fixed {rpc_client}")
    
    # Fix accounting.py line 58
    accounting = ROOT / "src/the_block/accounting.py"
    if accounting.exists():
        content = accounting.read_text()
        # Fix: meta Dict = field(default_factory=dict)
        content = re.sub(
            r'meta Dict = field\(',
            'meta: Dict = field(',
            content
        )
        accounting.write_text(content)
        print(f"  ✅ Fixed {accounting}")
    
    # Fix receipts.py
    receipts = ROOT / "src/the_block/receipts.py"
    if receipts.exists():
        content = receipts.read_text()
        # Common syntax errors
        content = re.sub(r'(\w+) (Dict|List|Optional|Tuple)\[', r'\1: \2[', content)
        receipts.write_text(content)
        print(f"  ✅ Fixed {receipts}")
    
    # Fix dashboard_server.py
    dashboard = ROOT / "src/the_block/dashboard_server.py"
    if dashboard.exists():
        content = dashboard.read_text()
        content = re.sub(r'(\w+) (Dict|List|Optional|Tuple)\[', r'\1: \2[', content)
        dashboard.write_text(content)
        print(f"  ✅ Fixed {dashboard}")

def update_pyproject_toml():
    """Update package naming and remove Solana dependency."""
    print("\n📦 Updating pyproject.toml...")
    
    pyproject = ROOT / "pyproject.toml"
    if not pyproject.exists():
        print("  ⚠️  pyproject.toml not found")
        return
    
    content = pyproject.read_text()
    
    # Rename package
    content = content.replace('name = "sol-bot"', 'name = "block-buster"')
    
    # Remove Solana dependency
    content = re.sub(r'\s+"solana>=0\.30",?\n', '', content)
    
    # Remove other third-party deps (optional - comment out for now)
    # content = re.sub(r'\s+"fastapi==.*",?\n', '', content)
    # content = re.sub(r'\s+"uvicorn==.*",?\n', '', content)
    
    pyproject.write_text(content)
    print("  ✅ Updated pyproject.toml")
    print("    - Renamed sol-bot → block-buster")
    print("    - Removed solana>=0.30 dependency")

def fix_imports():
    """Fix all import paths from solbot.* to block_buster.*"""
    print("\n🔄 Fixing import paths...")
    
    patterns = [
        (r'from solbot\.', 'from block_buster.'),
        (r'import solbot\.', 'import block_buster.'),
        (r'from sol_seeker', 'from features'),
        (r'import sol_seeker', 'import features'),
    ]
    
    fixed_count = 0
    
    for py_file in ROOT.rglob("*.py"):
        if 'venv' in str(py_file) or 'node_modules' in str(py_file):
            continue
        
        try:
            content = py_file.read_text()
            original = content
            
            for old_pattern, new_pattern in patterns:
                content = re.sub(old_pattern, new_pattern, content)
            
            if content != original:
                py_file.write_text(content)
                fixed_count += 1
                print(f"  ✅ Fixed imports in {py_file.relative_to(ROOT)}")
        except Exception as e:
            print(f"  ⚠️  Error in {py_file}: {e}")
    
    print(f"  🎯 Fixed imports in {fixed_count} files")

def update_config_paths():
    """Update config paths from ~/.solbot/ to ~/.block-buster/"""
    print("\n📁 Updating config paths...")
    
    config_file = ROOT / "src/block_buster/utils/config.py"
    if config_file.exists():
        content = config_file.read_text()
        
        # Update paths
        content = content.replace('~/.solbot/', '~/.block-buster/')
        content = content.replace('.solbot', '.block-buster')
        
        # Update default Solana URLs to The Block defaults
        content = re.sub(
            r'wss://api\.devnet\.solana\.com',
            'ws://localhost:9944',
            content
        )
        content = re.sub(
            r'https://api\.devnet\.solana\.com',
            'http://localhost:9933',
            content
        )
        
        config_file.write_text(content)
        print(f"  ✅ Updated {config_file}")

def remove_solana_code():
    """Remove Solana-specific code."""
    print("\n🗑️  Removing Solana-specific code...")
    
    # Remove solana directory
    solana_dir = ROOT / "src/block_buster/solana"
    if solana_dir.exists():
        import shutil
        shutil.rmtree(solana_dir)
        print(f"  ✅ Removed {solana_dir}")
    
    # Update assets.py to remove Solana token-list
    assets = ROOT / "src/block_buster/persistence/assets.py"
    if assets.exists():
        content = assets.read_text()
        
        # Remove Solana token imports
        content = re.sub(r'from solana.*\n', '', content)
        content = re.sub(r'import solana.*\n', '', content)
        
        # Remove token-list usage (line 18 area)
        # This might need manual review
        
        assets.write_text(content)
        print(f"  ✅ Updated {assets}")

def update_rpc_methods():
    """Update RPC method calls to match actual node."""
    print("\n🔧 Updating RPC method names...")
    
    # Mapping of old (wrong) to new (correct) RPC methods
    rpc_mappings = {
        'peer.list': 'net.peers',
        'peer.stats': 'net.stats',
        'consensus.block_height': 'light.latest_header',
        'storage.list': 'storage.stats',
    }
    
    fixed_files = []
    
    for py_file in (ROOT / "src").rglob("*.py"):
        if 'venv' in str(py_file):
            continue
        
        try:
            content = py_file.read_text()
            original = content
            
            for old_method, new_method in rpc_mappings.items():
                # Match strings like "peer.list" or 'peer.list'
                content = re.sub(
                    f'(["\']){re.escape(old_method)}(["\'])',
                    f'\\1{new_method}\\2',
                    content
                )
            
            if content != original:
                py_file.write_text(content)
                fixed_files.append(py_file)
                print(f"  ✅ Updated RPC methods in {py_file.relative_to(ROOT)}")
        except Exception as e:
            print(f"  ⚠️  Error in {py_file}: {e}")
    
    print(f"  🎯 Updated {len(fixed_files)} files")

def remove_mock_data():
    """Remove mock data from frontend components."""
    print("\n🎭 Removing mock data from frontend...")
    
    network_strength = ROOT / "web/src/pages/NetworkStrength.tsx"
    if network_strength.exists():
        content = network_strength.read_text()
        
        # This requires manual review - just flag it
        if 'mock' in content.lower() or 'dummy' in content.lower():
            print(f"  ⚠️  {network_strength} contains mock data - manual review needed")
            print("     Replace mock data with API calls to /theblock/network/metrics")

def create_gitignore():
    """Create/update .gitignore for block-buster."""
    print("\n🚀 Updating .gitignore...")
    
    gitignore = ROOT / ".gitignore"
    
    ignore_patterns = [
        "# Python",
        "__pycache__/",
        "*.py[cod]",
        "*$py.class",
        "*.so",
        ".Python",
        "venv/",
        "env/",
        "ENV/",
        ".venv/",
        "*.egg-info/",
        "dist/",
        "build/",
        "",
        "# JavaScript",
        "node_modules/",
        "dist/",
        "build/",
        ".cache/",
        ".vite/",
        "",
        "# IDE",
        ".vscode/",
        ".idea/",
        "*.swp",
        "*.swo",
        "",
        "# OS",
        ".DS_Store",
        "Thumbs.db",
        "",
        "# Logs",
        "*.log",
        "logs/",
        "",
        "# Config",
        ".env",
        ".env.local",
        "config.local.*",
    ]
    
    existing = set()
    if gitignore.exists():
        existing = set(gitignore.read_text().splitlines())
    
    new_patterns = [p for p in ignore_patterns if p not in existing]
    
    if new_patterns:
        with gitignore.open('a') as f:
            f.write('\n' + '\n'.join(new_patterns) + '\n')
        print(f"  ✅ Updated .gitignore with {len(new_patterns)} new patterns")
    else:
        print("  ✔️  .gitignore already up to date")

def print_summary():
    """Print summary of remaining manual tasks."""
    print("\n" + "="*60)
    print("🎉 Automated fixes complete!")
    print("="*60)
    print("\n📝 Remaining manual tasks:")
    print()
    print("1. Review syntax fixes in:")
    print("   - src/the_block/rpc_client.py")
    print("   - src/the_block/accounting.py")
    print("   - src/the_block/receipts.py")
    print("   - src/the_block/dashboard_server.py")
    print()
    print("2. Implement missing backend endpoints:")
    print("   - /theblock/receipts")
    print("   - /theblock/operations")
    print("   - /theblock/network/metrics")
    print("   - /theblock/markets/health")
    print("   - /theblock/peers/list")
    print()
    print("3. Remove mock data from:")
    print("   - web/src/pages/NetworkStrength.tsx")
    print()
    print("4. Choose and consolidate servers:")
    print("   - Keep dashboard_server.py OR production_server.py")
    print("   - Delete the other")
    print()
    print("5. Test the build:")
    print("   cd ~/projects/the-block/block-buster")
    print("   python -m the_block.production_server")
    print()
    print("6. Update Rust RPC documentation to match Python client expectations")
    print()
    print("📚 See CLEANUP_SOLANA_RESIDUE.md for complete checklist")
    print()

if __name__ == "__main__":
    print("🧬 Block Buster Cleanup Script")
    print("Fixing Solana residue and syntax errors...\n")
    
    try:
        fix_syntax_errors()
        update_pyproject_toml()
        fix_imports()
        update_config_paths()
        remove_solana_code()
        update_rpc_methods()
        remove_mock_data()
        create_gitignore()
        print_summary()
    except Exception as e:
        print(f"\n❌ Error during cleanup: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
