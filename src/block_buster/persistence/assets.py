"""Asset registry service (first-party HTTP client)."""

import os
import hashlib
from typing import List, Dict, Optional

from block_buster.core.http_client import HTTPClient, HTTPError
from .dal import DAL


class AssetService:
    """Fetch and store asset metadata."""

    def __init__(self, dal: DAL, url: Optional[str] = None) -> None:
        self.dal = dal
        self.url = url or os.getenv(
            "ASSET_LIST_URL",
            "https://assets.theblock.local/tokenlist.json",
        )
        self.http = HTTPClient(timeout=10)

    def refresh(self) -> List[Dict]:
        try:
            resp = self.http.get(self.url)
            if not resp.ok:
                raise HTTPError(resp.status_code, resp.text, resp)
            tokens = resp.json().get("tokens", [])
        except Exception:
            return self.dal.list_assets()
        # Deduplicate by symbol to avoid DB constraint violations
        uniq = list({t.get("symbol"): t for t in tokens}.values())
        checksum = hashlib.sha256(resp.body).hexdigest()
        stored = self.dal.get_meta("asset_checksum")
        if stored == checksum:
            return self.dal.list_assets()
        self.dal.save_assets(uniq)
        self.dal.set_meta("asset_checksum", checksum)
        return uniq

    def list_assets(self) -> List[Dict]:
        assets = self.dal.list_assets()
        if not assets:
            assets = self.refresh()
        return assets

    def invalidate_cache(self) -> None:
        """Force refresh by clearing stored assets/prices."""
        self.dal.invalidate_assets_and_prices()
