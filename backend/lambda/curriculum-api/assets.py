"""POST /v1/curriculum/assets/upload-url: a short-lived signed form for uploading one image or PDF.

A signed POST (not a PUT) lets S3 itself enforce the type and the size limit, so the
browser cannot upload anything else with this URL. Only PNG, JPEG and WebP images (5 MB) and
PDF slide decks (20 MB) are allowed: SVG is refused because it can carry script.
"""
import os
import uuid

import boto3
from botocore.config import Config

from access import require_author
from cic import validate
from cic.http import Request

TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf"}
MAX_BYTES = 5 * 1024 * 1024
MAX_PDF_BYTES = 20 * 1024 * 1024
EXPIRES_SECONDS = 300
_s3 = None


def s3():
    global _s3
    if _s3 is None:
        # The regional endpoint: the global one (bucket.s3.amazonaws.com) answers a new
        # bucket with a 307 redirect for hours, which a browser upload does not survive.
        region = os.environ.get("AWS_REGION", "us-west-2")
        _s3 = boto3.client("s3", region_name=region, endpoint_url=f"https://s3.{region}.amazonaws.com",
                           config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _s3


def upload_url(req: Request):
    require_author(req.auth)
    body = req.json()
    validate.reject_unknown(body, ("contentType", "size"))
    content_type = validate.choice(body, "contentType", TYPES)
    if content_type is None:
        raise validate.ValidationError("contentType must be image/png, image/jpeg, image/webp or application/pdf")
    size = validate.integer(body.get("size"), "size", 1, MAX_PDF_BYTES if content_type == "application/pdf" else MAX_BYTES)
    key = f"curriculum/{uuid.uuid4().hex}.{TYPES[content_type]}"
    post = s3().generate_presigned_post(
        Bucket=os.environ["ASSETS_BUCKET"], Key=key, ExpiresIn=EXPIRES_SECONDS,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, size]])
    return {"uploadUrl": post["url"], "fields": post["fields"], "key": key,
            "assetUrl": f"{os.environ['ASSETS_URL'].rstrip('/')}/{key}",
            "expiresInSeconds": EXPIRES_SECONDS, "maxBytes": size}


ROUTES = {"POST /v1/curriculum/assets/upload-url": upload_url}
