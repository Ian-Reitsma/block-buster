"""Governor namespace RPC methods."""

from ..rpc_client import RPCClient
from ..models.governor import GovernorStatus, GateState


class GovernorNamespace:
    """Typed wrapper for governor.* RPC methods."""
    
    def __init__(self, client: RPCClient):
        self.client = client
    
    def get_status(self) -> GovernorStatus:
        """Fetch current governor status including gates and economics metrics.
        
        Returns:
            GovernorStatus with current gate states and metrics
        """
        result = self.client.call("governor.status")
        raw_gates = result.get("gates", [])
        gates = {}
        # governor.status returns a list of GateSnapshot entries in The Block.
        if isinstance(raw_gates, list):
            for gate in raw_gates:
                if not isinstance(gate, dict):
                    continue
                name = gate.get("name") or gate.get("gate") or ""
                if not name:
                    continue
                gates[name] = GateState(
                    name=name,
                    state=gate.get("state", "unknown"),
                    reason=gate.get("last_reason") or gate.get("reason"),
                    last_transition_height=gate.get("last_transition_height"),
                    enter_streak=gate.get("enter_streak"),
                    exit_streak=gate.get("exit_streak"),
                    streak_required=gate.get("streak_required"),
                    last_metrics=gate.get("last_metrics"),
                )
        elif isinstance(raw_gates, dict):
            for name, gate in raw_gates.items():
                if not isinstance(gate, dict):
                    continue
                gates[name] = GateState(
                    name=name,
                    state=gate.get("state", "unknown"),
                    reason=gate.get("reason"),
                    last_transition_height=gate.get("last_transition_height"),
                    enter_streak=gate.get("enter_streak"),
                    exit_streak=gate.get("exit_streak"),
                    streak_required=gate.get("streak_required"),
                    last_metrics=gate.get("last_metrics"),
                )
        return GovernorStatus(
            gates=gates,
            economics_metrics=result.get("economics_prev_market_metrics", []),
            decisions=result.get("decisions", []),
            block_height=result.get("block_height", 0),
        )
    
    def check_gate(self, market: str) -> bool:
        """Check if a specific market gate allows submissions.
        
        Args:
            market: Market name (e.g., "compute_market", "storage", "energy", "ad_market")
            
        Returns:
            True if gate is in 'Trade' state, False otherwise
        """
        status = self.get_status()
        gate = status.gates.get(market)
        if not gate:
            return False
        return gate.state == "Trade"
