#!/usr/bin/env python3
"""Cross-language verification helper for x402-avm-js tests.

Handles:
1. Verifying and settling x402 payment headers on LocalNet using real FacilitatorScheme.
2. Verifying browser identity transaction headers using verify_identity_txn.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from algosdk import kmd, mnemonic
from algosdk.v2client import algod
from ai_economy_sdk import DefaultAvmSigner, verify_identity_txn
from x402.http.utils import decode_payment_signature_header
from x402_algorand.exact.facilitator import ExactAvmScheme
from x402_algorand.types import ExactAvmPayload
from x402_algorand.utils import decode_base64_transaction

DEFAULT_ALGOD_URL = os.environ.get("ALGOD_URL", "http://localhost:4001")
DEFAULT_ALGOD_TOKEN = os.environ.get("ALGOD_TOKEN", "a" * 64)
DEFAULT_KMD_URL = os.environ.get("KMD_URL", "http://localhost:4002")
DEFAULT_KMD_TOKEN = os.environ.get("KMD_TOKEN", "a" * 64)


def get_kmd_key(
    target_addr: str,
    kmd_url: str = DEFAULT_KMD_URL,
    kmd_token: str = DEFAULT_KMD_TOKEN,
) -> str | None:
    """Export private key for target address from KMD default wallet if present."""
    try:
        k = kmd.KMDClient(kmd_token, kmd_url)
        wallets = k.list_wallets()
        def_wallet = next(
            (w for w in wallets if w.get("name") == "unencrypted-default-wallet"), None
        )
        if not def_wallet:
            return None
        handle = k.init_wallet_handle(def_wallet["id"], "")
        return k.export_key(handle, "", target_addr)
    except Exception:
        return None


def handle_identity(
    header_val: str,
    expected_gh: str | None = None,
    algod_url: str = DEFAULT_ALGOD_URL,
    algod_token: str = DEFAULT_ALGOD_TOKEN,
) -> None:
    exp_gh = expected_gh
    if not exp_gh:
        try:
            algod_client = algod.AlgodClient(algod_token, algod_url)
            sp = algod_client.suggested_params()
            exp_gh = sp.gh
        except Exception:
            exp_gh = None

    verified_addr = verify_identity_txn(header_val.strip(), exp_gh) if exp_gh else None
    res = {
        "valid": verified_addr is not None,
        "address": verified_addr,
    }
    print(json.dumps(res))


def handle_payment(
    tempfile_path: str,
    fee_payer_mnemonic: str | None = None,
    algod_url: str = DEFAULT_ALGOD_URL,
    algod_token: str = DEFAULT_ALGOD_TOKEN,
    kmd_url: str = DEFAULT_KMD_URL,
    kmd_token: str = DEFAULT_KMD_TOKEN,
) -> None:
    p = Path(tempfile_path)
    if not p.exists():
        res = {"verify": False, "reason": f"File not found: {tempfile_path}", "settled_txid": None}
        print(json.dumps(res))
        sys.exit(1)

    header_val = p.read_text(encoding="utf-8").strip()
    payload = decode_payment_signature_header(header_val)
    algod_client = algod.AlgodClient(algod_token, algod_url)

    extra = getattr(payload.accepted, "extra", {}) or {}
    fee_payer_addr = extra.get("feePayer")

    fee_payer_pk = None
    if fee_payer_mnemonic:
        fee_payer_pk = mnemonic.to_private_key(fee_payer_mnemonic)
    elif fee_payer_addr:
        fee_payer_pk = get_kmd_key(fee_payer_addr, kmd_url=kmd_url, kmd_token=kmd_token)

    if not fee_payer_pk:
        # Fallback: try KMD primary key
        try:
            k = kmd.KMDClient(kmd_token, kmd_url)
            wallets = k.list_wallets()
            def_wallet = next(
                (w for w in wallets if w.get("name") == "unencrypted-default-wallet"), None
            )
            if def_wallet:
                handle = k.init_wallet_handle(def_wallet["id"], "")
                keys = k.list_keys(handle)
                if keys:
                    fee_payer_pk = k.export_key(handle, "", keys[0])
        except Exception:
            pass

    if not fee_payer_pk:
        raise ValueError(f"Could not resolve private key for fee payer: {fee_payer_addr}")

    fee_payer_signer = DefaultAvmSigner(fee_payer_pk, algod_client=algod_client)
    facilitator = ExactAvmScheme(fee_payer_signer)

    # Decode payment transaction ID from paymentIndex
    payment_txid = None
    try:
        from algosdk import encoding
        avm_payload = ExactAvmPayload.from_dict(payload.payload)
        b64_ptxn = avm_payload.payment_group[avm_payload.payment_index]
        dec_obj = encoding.msgpack_decode(b64_ptxn)
        payment_txid = dec_obj.get_txid()
    except Exception:
        pass

    # 1. Verify
    verify_res = facilitator.verify(payload, payload.accepted)
    if not verify_res.is_valid:
        res = {
            "verify": False,
            "reason": verify_res.invalid_reason or "verification_failed",
            "message": verify_res.invalid_message,
            "settled_txid": None,
            "payment_txid": payment_txid,
            "payer": verify_res.payer,
        }
        print(json.dumps(res))
        return

    # 2. Settle
    settle_res = facilitator.settle(payload, payload.accepted)
    res = {
        "verify": True,
        "reason": None if settle_res.success else (settle_res.error_reason or "settlement_failed"),
        "settled_txid": settle_res.transaction if settle_res.success else None,
        "payment_txid": payment_txid,
        "payer": verify_res.payer,
        "success": settle_res.success,
    }
    print(json.dumps(res))


def main() -> None:
    parser = argparse.ArgumentParser(description="x402-avm-js verification helper")
    parser.add_argument("--identity", type=str, help="X-Identity-Txn header string to verify")
    parser.add_argument("--genesis-hash", type=str, default=None, help="Expected genesis hash base64")
    parser.add_argument("--fee-payer-mnemonic", type=str, default=None, help="Fee payer mnemonic for signing facilitator txns")
    parser.add_argument("--algod-url", type=str, default=DEFAULT_ALGOD_URL, help="Algod server URL")
    parser.add_argument("--algod-token", type=str, default=DEFAULT_ALGOD_TOKEN, help="Algod token")
    parser.add_argument("--kmd-url", type=str, default=DEFAULT_KMD_URL, help="KMD URL")
    parser.add_argument("--kmd-token", type=str, default=DEFAULT_KMD_TOKEN, help="KMD token")
    parser.add_argument("tempfile", nargs="?", help="Path to file containing base64 payment header")

    args = parser.parse_args()

    if args.identity:
        handle_identity(args.identity, args.genesis_hash, algod_url=args.algod_url, algod_token=args.algod_token)
    elif args.tempfile:
        handle_payment(
            args.tempfile,
            fee_payer_mnemonic=args.fee_payer_mnemonic,
            algod_url=args.algod_url,
            algod_token=args.algod_token,
            kmd_url=args.kmd_url,
            kmd_token=args.kmd_token,
        )
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
