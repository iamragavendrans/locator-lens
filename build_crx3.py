#!/usr/bin/env python3
"""Build CRX3 from public key DER, signature DER, and ZIP archive."""
import struct, sys, hashlib

def varint(v):
    p = []
    while v > 0x7F: p.append((v & 0x7F) | 0x80); v >>= 7
    p.append(v & 0x7F)
    return bytes(p)

def field(num, data):
    return varint((num << 3) | 2) + varint(len(data)) + data

def main():
    if len(sys.argv) != 5:
        print(f"Usage: {sys.argv[0]} <pub.der> <sig.der> <archive.zip> <out.crx>"); sys.exit(1)
    pub = open(sys.argv[1], 'rb').read()
    sig = open(sys.argv[2], 'rb').read()
    zdata = open(sys.argv[3], 'rb').read()
    crx_id = hashlib.sha256(pub).digest()[:16]
    signed_data = field(1, crx_id)
    key_proof = field(1, pub) + field(2, sig)
    header = field(2, key_proof) + field(10000, signed_data)
    with open(sys.argv[4], 'wb') as f:
        f.write(b'Cr24')
        f.write(struct.pack('<I', 3))
        f.write(struct.pack('<I', len(header)))
        f.write(header)
        f.write(zdata)
    total = 12 + len(header) + len(zdata)
    print(f"CRX3: {sys.argv[4]} ({total} bytes)")

if __name__ == '__main__': main()
