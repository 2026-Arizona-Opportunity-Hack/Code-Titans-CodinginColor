"""Thin wrapper over the Bedrock Converse API for short, bounded completions.

The model ID and region come from the environment (set by CDK). The Lambda's IAM role is
allowed to invoke that one model only. The client is created once per container.
"""
import os
from typing import Any, Dict

import boto3
from botocore.config import Config

_client = None


def _bedrock():
    global _client
    if _client is None:
        region = os.environ.get("BEDROCK_REGION")
        if not region:
            raise ValueError("BEDROCK_REGION not set")
        # One attempt and a short timeout: a slow model should fail fast, not hold a student's request.
        _client = boto3.client("bedrock-runtime", region_name=region,
                               config=Config(connect_timeout=3, read_timeout=8, retries={"max_attempts": 1}))
    return _client


def converse(system: str, user: str, max_tokens: int = 300, temperature: float = 0.3) -> Dict[str, Any]:
    """Return {"text", "inputTokens", "outputTokens"} for one system and one user message."""
    model_id = os.environ.get("HINT_MODEL_ID")
    if not model_id:
        raise ValueError("HINT_MODEL_ID not set")
    resp = _bedrock().converse(
        modelId=model_id,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": user}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
    )
    parts = resp["output"]["message"]["content"]
    usage = resp.get("usage", {})
    return {"text": "".join(p.get("text", "") for p in parts).strip(),
            "inputTokens": int(usage.get("inputTokens", 0)), "outputTokens": int(usage.get("outputTokens", 0))}
