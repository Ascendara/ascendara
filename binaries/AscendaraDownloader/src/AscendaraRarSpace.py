"""Map where a RAR archive keeps each file's data, and give that space back.

RAR extractors read front to back, so once a file has been extracted its
compressed bytes are never read again. Releasing them as extraction moves on
means a game needs free space for its files, not its files plus the archive.

Space is released by punching holes: the bytes become a sparse, unallocated
region, while every header stays where it was. A non-solid archive can then
still be reopened and the finished files skipped, so extraction resumes. On a
filesystem without holes (FAT32, exFAT), finished volumes are deleted instead.
"""
import ctypes
import os
import re
import secrets
import stat
import struct
import sys
import zlib

SIGNATURE4 = b'Rar!\x1a\x07\x00'
SIGNATURE5 = b'Rar!\x1a\x07\x01\x00'
# Hole boundaries are rounded inward to this, which every filesystem's
# allocation unit divides, so no byte outside a file's data is ever touched.
ALIGN = 64 * 1024


class RarLayoutError(Exception):
    """The archive cannot be mapped with certainty; extract it normally."""


class Entry:
    __slots__ = ('name', 'size', 'directory', 'link', 'pieces')

    def __init__(self, name, size, directory, link):
        self.name, self.size, self.directory, self.link = name, size, directory, link
        self.pieces = []  # (volume index, data start, data end)

    @property
    def packed(self):
        return sum(end - start for _, start, end in self.pieces)


class Layout:
    def __init__(self):
        self.volumes = []
        self.entries = []
        self.solid = False
        self.new_numbering = True


def _read_exact(stream, count):
    data = stream.read(count)
    if len(data) != count:
        raise RarLayoutError('Archive headers end unexpectedly')
    return data


def _vint(data, pos):
    value = shift = 0
    while True:
        if pos >= len(data) or shift > 63:
            raise RarLayoutError('Malformed RAR5 header')
        byte = data[pos]
        pos += 1
        value |= (byte & 0x7f) << shift
        shift += 7
        if not byte & 0x80:
            return value, pos


def _add_piece(layout, name, size, directory, link, continued, piece):
    if continued:
        entry = layout.entries[-1] if layout.entries else None
        if entry is None or entry.name != name:
            raise RarLayoutError(f'Volume continues an unknown file: {name}')
    else:
        entry = Entry(name, size, directory, link)
        layout.entries.append(entry)
    if piece[2] > piece[1]:
        entry.pieces.append(piece)


def _parse5(stream, volume, size, layout):
    """Returns whether another volume follows."""
    stream.seek(len(SIGNATURE5))
    while True:
        start = stream.tell()
        if start >= size:
            raise RarLayoutError('Archive volume has no end header')
        head = stream.read(7)
        if len(head) < 5:
            raise RarLayoutError('Archive headers end unexpectedly')
        crc = struct.unpack_from('<I', head)[0]
        header_size, pos = _vint(head, 4)
        if not 2 <= header_size <= 0x200000:
            raise RarLayoutError('Malformed RAR5 header size')
        stream.seek(start + pos)
        body = _read_exact(stream, header_size)
        if zlib.crc32(head[4:pos] + body) != crc:
            raise RarLayoutError('RAR5 header checksum mismatch')
        kind, p = _vint(body, 0)
        flags, p = _vint(body, p)
        extra = data = 0
        if flags & 0x01:
            extra, p = _vint(body, p)
        if flags & 0x02:
            data, p = _vint(body, p)
        data_start = start + pos + header_size
        if data_start + data > size:
            raise RarLayoutError('Archive volume is truncated')
        if kind == 1:
            archive_flags, p = _vint(body, p)
            if archive_flags & 0x04:
                layout.solid = True
            if volume == 0 and archive_flags & 0x02:
                number, p = _vint(body, p)
                if number:
                    raise RarLayoutError('Not the first archive volume')
        elif kind == 4:
            raise RarLayoutError('Archive headers are encrypted')
        elif kind == 2:
            file_flags, p = _vint(body, p)
            unpacked, p = _vint(body, p)
            _, p = _vint(body, p)  # attributes
            p += 4 if file_flags & 0x02 else 0
            p += 4 if file_flags & 0x04 else 0
            compression, p = _vint(body, p)
            _, p = _vint(body, p)  # host OS
            name_size, p = _vint(body, p)
            if file_flags & 0x08:
                raise RarLayoutError('Archive has a file of unknown size')
            try:
                name = body[p:p + name_size].decode('utf-8')
            except UnicodeDecodeError:
                raise RarLayoutError('Undecodable file name') from None
            if compression & 0x40:
                layout.solid = True
            link = False
            records = body[len(body) - extra:] if extra else b''
            q = 0
            while q < len(records):
                record_size, q = _vint(records, q)
                record_type, _ = _vint(records, q)
                link = link or record_type == 0x05  # file system redirection
                q += record_size
            _add_piece(layout, name.replace('\\', '/'), unpacked, bool(file_flags & 0x01), link,
                       bool(flags & 0x08), (volume, data_start, data_start + data))
        elif kind == 5:
            more, _ = _vint(body, p)
            return bool(more & 0x01)
        stream.seek(data_start + data)


def _decode_unicode(ascii_name, encoded):
    """RAR 3.x stores Unicode names as a diff against their ASCII form."""
    if not encoded:
        return ascii_name.decode('ascii')
    high, pos, flags, bits, out = encoded[0], 1, 0, 0, []
    try:
        while pos < len(encoded):
            if bits == 0:
                flags, pos, bits = encoded[pos], pos + 1, 8
            bits -= 2
            mode = (flags >> bits) & 3
            if mode == 0:
                out.append(encoded[pos])
                pos += 1
            elif mode == 1:
                out.append(encoded[pos] + (high << 8))
                pos += 1
            elif mode == 2:
                out.append(encoded[pos] + (encoded[pos + 1] << 8))
                pos += 2
            else:
                length = encoded[pos]
                pos += 1
                if length & 0x80:
                    correction = encoded[pos]
                    pos += 1
                    for _ in range((length & 0x7f) + 2):
                        out.append(((ascii_name[len(out)] + correction) & 0xff) + (high << 8))
                else:
                    for _ in range(length + 2):
                        out.append(ascii_name[len(out)])
        return ''.join(map(chr, out))
    except (IndexError, ValueError):
        raise RarLayoutError('Malformed Unicode file name') from None


def _rar4_name(raw, flags):
    if flags & 0x200:
        zero = raw.find(b'\0')
        try:
            return raw.decode('utf-8') if zero < 0 else _decode_unicode(raw[:zero], raw[zero + 1:])
        except UnicodeDecodeError:
            raise RarLayoutError('Undecodable file name') from None
    try:
        return raw.decode('ascii')
    except UnicodeDecodeError:
        # A legacy code page name; which one the extractor applies is unknown.
        raise RarLayoutError('File name in a legacy code page') from None


def _parse4(stream, volume, size, layout):
    """Returns whether another volume follows."""
    pos = 0
    split_after = False
    while pos < size:
        stream.seek(pos)
        base = _read_exact(stream, 7)
        crc, kind, flags, header_size = struct.unpack('<HBHH', base)
        if header_size < 7:
            raise RarLayoutError('Malformed RAR header size')
        header = base + _read_exact(stream, header_size - 7)
        data = 0
        if kind in (0x74, 0x7a):
            if header_size < 32:
                raise RarLayoutError('Malformed RAR file header')
            if zlib.crc32(header[2:]) & 0xffff != crc:
                raise RarLayoutError('RAR header checksum mismatch')
            data, unpacked, host, _, _, _, _, name_size, attributes = struct.unpack_from('<IIBIIBBHI', header, 7)
            offset = 32
            if flags & 0x100:
                high_data, high_unpacked = struct.unpack_from('<II', header, 32)
                data |= high_data << 32
                unpacked |= high_unpacked << 32
                offset = 40
            if kind == 0x74:
                name = _rar4_name(header[offset:offset + name_size], flags).replace('\\', '/')
                link = (stat.S_ISLNK(attributes) if host == 3 else bool(attributes & 0x400))
                if flags & 0x10:
                    layout.solid = True
                split_after = bool(flags & 0x02)
                _add_piece(layout, name, unpacked, flags & 0xe0 == 0xe0, link, bool(flags & 0x01),
                           (volume, pos + header_size, pos + header_size + data))
        elif kind == 0x73:
            if flags & 0x80:
                raise RarLayoutError('Archive headers are encrypted')
            if flags & 0x08:
                layout.solid = True
            if volume == 0:
                if flags & 0x01 and not flags & 0x100 and flags & 0x10:
                    raise RarLayoutError('Not the first archive volume')
                layout.new_numbering = bool(flags & 0x10)
        elif kind == 0x7b:
            return bool(flags & 0x01)
        elif flags & 0x8000:
            if header_size < 11:
                raise RarLayoutError('Malformed RAR block')
            data = struct.unpack_from('<I', header, 7)[0]
        if pos + header_size + data > size:
            raise RarLayoutError('Archive volume is truncated')
        pos += header_size + data
    # Archives from old RAR versions may end without an end block.
    return split_after


def _next_volume(path, new_numbering):
    folder, name = os.path.split(path)
    if new_numbering:
        stem, extension = os.path.splitext(name)
        match = re.search(r'(\d+)(\D*)$', stem)
        if not match:
            raise RarLayoutError('Volume name has no number')
        digits = match.group(1)
        number = str(int(digits) + 1).zfill(len(digits))
        candidate = stem[:match.start(1)] + number + match.group(2) + extension
    else:
        match = re.fullmatch(r'(.*\.)(?:(rar)|([a-z])(\d\d))', name, re.I)
        if not match:
            raise RarLayoutError('Unrecognized volume name')
        if match.group(2):
            candidate = match.group(1) + ('r00' if match.group(2).islower() else 'R00')
        else:
            letter, number = match.group(3), int(match.group(4)) + 1
            if number == 100:
                letter, number = chr(ord(letter) + 1), 0
            candidate = match.group(1) + letter + f'{number:02d}'
    target = os.path.join(folder, candidate)
    if os.path.isfile(target):
        return target
    # Case-sensitive filesystems: the name may differ only in case.
    for existing in os.listdir(folder or '.'):
        if existing.lower() == candidate.lower():
            return os.path.join(folder, existing)
    return None


def read_layout(first_volume):
    """Map every entry's data across all volumes, or raise RarLayoutError."""
    layout = Layout()
    with open(first_volume, 'rb') as stream:
        signature = stream.read(8)
    rar5 = signature == SIGNATURE5
    if not rar5 and signature[:7] != SIGNATURE4:
        raise RarLayoutError('Not a RAR archive, or one with a self-extractor')
    path = first_volume
    while True:
        size = os.path.getsize(path)
        with open(path, 'rb') as stream:
            if stream.read(len(SIGNATURE5 if rar5 else SIGNATURE4)) != (SIGNATURE5 if rar5 else SIGNATURE4):
                raise RarLayoutError(f'Volume has no RAR signature: {path}')
            more = (_parse5 if rar5 else _parse4)(stream, len(layout.volumes), size, layout)
        layout.volumes.append(path)
        if not more:
            break
        if len(layout.volumes) > 10000:
            raise RarLayoutError('Too many archive volumes')
        path = _next_volume(path, rar5 or layout.new_numbering)
        if path is None:
            raise RarLayoutError('An archive volume is missing')
    for entry in layout.entries:
        if any(start < 0 or end < start for _, start, end in entry.pieces):
            raise RarLayoutError('Malformed file data range')
    return layout


if os.name == 'nt':
    from ctypes import wintypes
    _kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    _kernel32.CreateFileW.restype = wintypes.HANDLE
    _kernel32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                                      wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    _kernel32.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                                          ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD),
                                          ctypes.c_void_p]
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel32.GetCompressedFileSizeW.restype = wintypes.DWORD
    _kernel32.GetCompressedFileSizeW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]


def _punch(path, start, length):
    if os.name == 'nt':
        # GENERIC_READ | GENERIC_WRITE; share read, write and delete with the extractor.
        handle = _kernel32.CreateFileW(path, 0xC0000000, 7, None, 3, 0, None)
        if handle == wintypes.HANDLE(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            returned = wintypes.DWORD()
            if not _kernel32.DeviceIoControl(handle, 0x900C4, None, 0, None, 0,  # FSCTL_SET_SPARSE
                                             ctypes.byref(returned), None):
                raise ctypes.WinError(ctypes.get_last_error())
            zero = struct.pack('<qq', start, start + length)  # FILE_ZERO_DATA_INFORMATION
            buffer = ctypes.create_string_buffer(zero, len(zero))
            if not _kernel32.DeviceIoControl(handle, 0x980C8, buffer, len(zero), None, 0,  # FSCTL_SET_ZERO_DATA
                                             ctypes.byref(returned), None):
                raise ctypes.WinError(ctypes.get_last_error())
        finally:
            _kernel32.CloseHandle(handle)
        return
    descriptor = os.open(path, os.O_WRONLY)
    try:
        if sys.platform == 'darwin':
            import fcntl
            # F_PUNCHHOLE with struct fpunchhole {fp_flags, reserved, fp_offset, fp_length}.
            fcntl.fcntl(descriptor, 99, struct.pack('IIqq', 0, 0, start, length))
        else:
            libc = ctypes.CDLL(None, use_errno=True)
            libc.fallocate.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int64, ctypes.c_int64]
            # FALLOC_FL_KEEP_SIZE | FALLOC_FL_PUNCH_HOLE
            if libc.fallocate(descriptor, 3, start, length) != 0:
                error = ctypes.get_errno()
                raise OSError(error, os.strerror(error), path)
    finally:
        os.close(descriptor)


def releasable(start, end):
    """Bytes a hole over [start, end) gives back: only whole ALIGN blocks are released."""
    return max(0, end // ALIGN * ALIGN - -(-start // ALIGN) * ALIGN)


def punch_hole(path, start, end):
    """Release the whole ALIGN blocks inside [start, end). Returns the bytes released."""
    first = -(-start // ALIGN) * ALIGN
    released = releasable(start, end)
    if released:
        _punch(path, first, released)
    return released


def allocated_size(path):
    if os.name == 'nt':
        high = wintypes.DWORD()
        low = _kernel32.GetCompressedFileSizeW(path, ctypes.byref(high))
        if low == 0xFFFFFFFF and ctypes.get_last_error():
            raise ctypes.WinError(ctypes.get_last_error())
        return (high.value << 32) | low
    return os.stat(path).st_blocks * 512


_probed = {}


def can_punch(directory):
    """Whether holes punched in files in `directory` really release disk space."""
    key = os.path.normcase(os.path.abspath(directory))
    if key not in _probed:
        probe = os.path.join(directory, f'.ascendara-hole-probe-{secrets.token_hex(4)}')
        content = os.urandom(8 * ALIGN)
        works = False
        try:
            with open(probe, 'wb') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            before = allocated_size(probe)
            punch_hole(probe, ALIGN, 7 * ALIGN)
            with open(probe, 'rb') as stream:
                after_content = stream.read()
            works = (allocated_size(probe) < before
                     and after_content[:ALIGN] == content[:ALIGN]
                     and after_content[7 * ALIGN:] == content[7 * ALIGN:]
                     and after_content[ALIGN:7 * ALIGN] == bytes(6 * ALIGN))
        except OSError:
            works = False
        finally:
            try:
                os.remove(probe)
            except OSError:
                pass
        _probed[key] = works
    return _probed[key]


def flush_file(path):
    """Make an extracted file durable before the archive bytes it came from are released."""
    if os.name != 'nt':
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return
    mode = None
    try:
        stream = open(path, 'rb+')
    except PermissionError:
        # Archived read-only attributes; Windows only flushes writable handles.
        mode = os.stat(path).st_mode
        os.chmod(path, mode | stat.S_IWRITE)
        stream = open(path, 'rb+')
    try:
        os.fsync(stream.fileno())
    finally:
        stream.close()
        if mode is not None:
            os.chmod(path, mode)
