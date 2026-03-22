#!/usr/bin/env python3
"""Build a CRX3 file from a public key, signature, and ZIP archive.

CRX3 binary format:
  4 bytes  — magic "Cr24"
  4 bytes  — uint32 LE version (3)
  4 bytes  — uint32 LE header length
  N bytes  — CRX3 SignedData protobuf (header)
  M bytes  — ZIP archive payload

The protobuf is hand-assembled here so we don't need any external dependencies.
"""

import struct
import sys
import hashlib


def encode_varint(value):
    """Encode an integer as a protobuf varint."""
    parts = []
    while value > 0x7F:
        parts.append((value & 0x7F) | 0x80)
        value >>= 7
    parts.append(value & 0x7F)
    return bytes(parts)


def encode_length_delimited(field_number, data):
    """Encode a length-delimited protobuf field."""
    tag = encode_varint((field_number << 3) | 2)
    length = encode_varint(len(data))
    return tag + length + data


def build_signed_header_data(public_key_der):
    """Build the CRX3 SignedData protobuf.

    message CrxFileHeader {
      repeated AsymmetricKeyProof sha256_with_rsa = 2;
    }
    message AsymmetricKeyProof {
      bytes public_key = 1;
      bytes signature  = 2;
    }
    message SignedData {
      bytes crx_id = 1;
    }
    """
    # crx_id is first 16 bytes of SHA-256 of the public key
    crx_id = hashlib.sha256(public_key_der).digest()[:16]
    signed_data = encode_length_delimited(1, crx_id)
    return signed_data


def build_crx3(pub_key_path, sig_path, zip_path, out_path):
    with open(pub_key_path, 'rb') as f:
        pub_key = f.read()
    with open(sig_path, 'rb') as f:
        signature = f.read()
    with open(zip_path, 'rb') as f:
        zip_data = f.read()

    # Build AsymmetricKeyProof
    key_proof = encode_length_delimited(1, pub_key) + encode_length_delimited(2, signature)

    # Build signed_data for the header
    signed_data = build_signed_header_data(pub_key)
    signed_data_field = encode_length_delimited(10000, signed_data)

    # Build CrxFileHeader: sha256_with_rsa = field 2
    header = encode_length_delimited(2, key_proof) + signed_data_field

    # Assemble CRX3
    magic = b'Cr24'
    version = struct.pack('<I', 3)
    header_size = struct.pack('<I', len(header))

    with open(out_path, 'wb') as f:
        f.write(magic)
        f.write(version)
        f.write(header_size)
        f.write(header)
        f.write(zip_data)

    print(f"CRX3 written: {out_path} ({len(magic) + len(version) + len(header_size) + len(header) + len(zip_data)} bytes)")


if __name__ == '__main__':
    if len(sys.argv) != 5:
        print(f"Usage: {sys.argv[0]} <pub.der> <sig.der> <archive.zip> <output.crx>")
        sys.exit(1)
    build_crx3(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
