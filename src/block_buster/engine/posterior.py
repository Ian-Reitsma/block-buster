"""Posterior probability engine stubs.

Lightweight online posterior models for rug and regime probabilities.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence
import json
import math
import hashlib

MODEL_VERSION = 1
WEIGHT_CLAMP = 5.0
MIN_LR = 1e-5
MAX_LR = 1.0


@dataclass
class PosteriorOutput:
    rug: float
    trend: float
    revert: float
    chop: float


class PosteriorEngine:
    """Online logistic/softmax regression for posterior predictions.

    The engine keeps separate weight matrices for rug probability (binary
    logistic) and regime probabilities (3-class softmax).  Both models share the
    first ``n_features`` elements of the input feature vector.
    """

    def __init__(self, n_features: int = 11) -> None:
        self.n_features = n_features
        self.w_rug = [0.0 for _ in range(n_features)]
        self.W_regime = [[0.0 for _ in range(n_features)] for _ in range(3)]

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": MODEL_VERSION, "w_rug": self.w_rug, "W_regime": self.W_regime}
        payload["checksum"] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        with open(path, "w") as f:
            json.dump(payload, f)

    @classmethod
    def load(cls, path: str | Path) -> "PosteriorEngine":
        with open(path, "r") as f:
            data = json.load(f)
        if data.get("version") != MODEL_VERSION:
            raise ValueError("posterior model version mismatch")
        expected = data.get("checksum")
        calc = hashlib.sha256(json.dumps({k: data[k] for k in ("version", "w_rug", "W_regime")}, sort_keys=True).encode()).hexdigest()
        if expected and expected != calc:
            raise ValueError("posterior model checksum mismatch")
        inst = cls(len(data["w_rug"]))
        inst.w_rug = data["w_rug"]
        inst.W_regime = data["W_regime"]
        return inst

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------
    def predict(self, x: Sequence[float]) -> PosteriorOutput:
        """Return posterior probabilities for rug and market regimes."""

        feat = list(x[: self.n_features])

        # Rug probability via logistic regression
        rug_logit = sum(w * v for w, v in zip(self.w_rug, feat))
        rug = 1.0 / (1.0 + math.exp(-rug_logit))

        # Regime probabilities via multinomial logistic (softmax)
        logits = [sum(w * v for w, v in zip(row, feat)) for row in self.W_regime]
        max_logit = max(logits) if logits else 0.0
        logits = [l - max_logit for l in logits]
        exps = [math.exp(l) for l in logits]
        denom = sum(exps) or 1.0
        probs = [e / denom for e in exps]

        return PosteriorOutput(rug=rug, trend=probs[0], revert=probs[1], chop=probs[2])

    # ------------------------------------------------------------------
    # Online update
    # ------------------------------------------------------------------
    def update(self, x: Sequence[float], rug: int, regime: int, lr: float = 0.01) -> None:
        """Online gradient step for logistic and softmax regressions.

        Parameters
        ----------
        x:
            Feature vector.
        rug:
            Observed rug outcome (1 if rug pull occurred else 0).
        regime:
            Index of realised regime: 0=trend, 1=revert, 2=chop.
        lr:
            Learning rate for gradient descent.
        """
        lr = min(max(lr, MIN_LR), MAX_LR)
        feat = list(x[: self.n_features])

        # Update rug logistic regression
        rug_pred = 1.0 / (1.0 + math.exp(-sum(w * v for w, v in zip(self.w_rug, feat))))
        rug_error = rug - rug_pred
        for i in range(self.n_features):
            self.w_rug[i] = _clip_weight(self.w_rug[i] + lr * rug_error * feat[i])

        # Update regime softmax regression
        logits = [sum(w * v for w, v in zip(row, feat)) for row in self.W_regime]
        max_logit = max(logits) if logits else 0.0
        logits = [l - max_logit for l in logits]
        exps = [math.exp(l) for l in logits]
        denom = sum(exps) or 1.0
        probs = [e / denom for e in exps]
        y = [0.0, 0.0, 0.0]
        y[regime] = 1.0
        error = [y_i - p_i for y_i, p_i in zip(y, probs)]
        for r in range(3):
            for i in range(self.n_features):
                self.W_regime[r][i] = _clip_weight(self.W_regime[r][i] + lr * error[r] * feat[i])

    # ------------------------------------------------------------------
    # Action selection
    # ------------------------------------------------------------------
    def decide_action(
        self, x: Sequence[float], volume_thr: float = 0.0, fee_thr: float = 1.0
    ) -> str:
        """Return trading action based on posterior and cost features.

        Parameters
        ----------
        x:
            Feature vector containing rolling volume, average fee and vwap at
            indices 8, 9 and 10 respectively.
        volume_thr:
            Minimum normalized rolling volume required to enter a position.
        fee_thr:
            Maximum normalized average fee tolerated when entering.  Fees above
            this threshold trigger an exit.
        """

        out = self.predict(x)
        vol = x[8] if len(x) > 8 else 0.0
        fee = x[9] if len(x) > 9 else 0.0
        if out.trend > max(out.revert, out.chop) and vol > volume_thr and fee < fee_thr:
            return "enter"
        if out.revert > out.trend or fee > fee_thr:
            return "exit"
        return "flat"


def _clip_weight(val: float) -> float:
    return max(-WEIGHT_CLAMP, min(WEIGHT_CLAMP, val))
