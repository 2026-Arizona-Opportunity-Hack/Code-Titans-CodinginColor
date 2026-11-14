"""Credential pepper: a server-side secret mixed into every student credential hash.

Read from Secrets Manager once per Lambda container and cached. Without the
pepper, a leaked table cannot be used to guess the three-word credentials offline.
"""
import os

import boto3

_cached = None


def get_pepper() -> bytes:
    global _cached
    if _cached is None:
        override = os.environ.get("CREDENTIAL_PEPPER")  # local tests only; never set in AWS
        if override:
            _cached = override.encode("utf-8")
        else:
            client = boto3.client("secretsmanager")
            value = client.get_secret_value(SecretId=os.environ["PEPPER_SECRET_ARN"])
            _cached = value["SecretString"].encode("utf-8")
    return _cached
