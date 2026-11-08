# ==============================================================================
# Ascendara Torrent Clients
# ==============================================================================
# Adapters that let the Torrent Handler drive different local torrent clients
# through one interface. Add a client by subclassing TorrentClient and
# registering it in CLIENTS.

import logging
from dataclasses import dataclass
from typing import Optional

import qbittorrentapi


@dataclass
class TorrentStatus:
    name: str
    progress: float  # 0..1
    download_speed: int  # bytes/s
    eta: int  # seconds
    save_path: str
    state: str  # the client's own state name, for logs and error messages
    complete: bool
    error: bool
    busy: bool  # checking or moving files, which can hold file locks


class TorrentClient:
    name = "torrent client"

    def __init__(self, host: str, port: int, username: str, password: str):
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    def connect(self):
        raise NotImplementedError

    def get(self, torrent_hash: str) -> Optional[TorrentStatus]:
        """Status of the torrent, or None when the client doesn't have it."""
        raise NotImplementedError

    def add(self, magnet_link: str, save_path: str):
        """Add a magnet link; raise if the client rejects it."""
        raise NotImplementedError

    def resume(self, torrent_hash: str):
        raise NotImplementedError

    def set_download_limit(self, torrent_hash: str, limit_bytes: int):
        raise NotImplementedError

    def remove(self, torrent_hash: str, delete_files: bool):
        raise NotImplementedError


class QbitClient(TorrentClient):
    name = "qBittorrent"
    default_port = 8080

    _BUSY_STATES = {'checkingup', 'checkingdl', 'movingfiles', 'checkingresumedata', 'allocating'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.client = None

    def connect(self):
        logging.info(
            f"Connecting to qBittorrent WebUI at {self.host}:{self.port} "
            f"as user '{self.username}'"
        )
        self.client = qbittorrentapi.Client(
            host=self.host,
            port=self.port,
            username=self.username,
            password=self.password
        )
        try:
            self.client.auth_log_in()
        except qbittorrentapi.LoginFailed as e:
            raise Exception(
                f"Failed to authenticate with qBittorrent at {self.host}:{self.port}. "
                "Check your credentials in Ascendara settings."
            ) from e
        except Exception as e:
            raise Exception(
                f"Failed to connect to qBittorrent at {self.host}:{self.port}. "
                "Make sure it's running with Web UI enabled and the host/port are correct."
            ) from e

    def get(self, torrent_hash):
        torrents = self.client.torrents_info(torrent_hashes=torrent_hash)
        if not torrents:
            return None
        t = torrents[0]
        state = t.state or ""
        return TorrentStatus(
            name=t.name,
            progress=t.progress,
            download_speed=t.dlspeed,
            eta=t.eta,
            save_path=t.save_path or "",
            state=state,
            complete=t.state_enum.is_complete,
            error=state in ("error", "missingFiles"),
            busy=state.lower() in self._BUSY_STATES,
        )

    @staticmethod
    def _add_succeeded(result) -> bool:
        """qBittorrent < 5.1 answers torrents/add with "Ok."/"Fails."; 5.1+ returns
        JSON metadata (success_count, pending_count, failure_count, added_torrent_ids)."""
        if isinstance(result, str):
            return result.strip() == "Ok."
        try:
            get = result.get if hasattr(result, "get") else lambda k, d=None: getattr(result, k, d)
            success = int(get("success_count", 0) or 0)
            pending = int(get("pending_count", 0) or 0)
            added = get("added_torrent_ids", None) or []
            if success or pending or added:
                return True
            if get("failure_count", None) is not None:
                return False
        except Exception:
            pass
        return str(result).strip() == "Ok."

    def add(self, magnet_link, save_path):
        result = self.client.torrents_add(
            urls=magnet_link,
            save_path=save_path,
            use_auto_torrent_management=False,
            sequential_download=True
        )
        if not self._add_succeeded(result):
            raise Exception(f"qBittorrent rejected the torrent ({result})")

    def resume(self, torrent_hash):
        # qBittorrent 5 renamed resume to start
        try:
            self.client.torrents_start(torrent_hashes=torrent_hash)
        except Exception:
            self.client.torrents_resume(torrent_hashes=torrent_hash)

    def set_download_limit(self, torrent_hash, limit_bytes):
        self.client.torrents_set_download_limit(limit=limit_bytes, torrent_hashes=torrent_hash)

    def remove(self, torrent_hash, delete_files):
        self.client.torrents_delete(delete_files=delete_files, torrent_hashes=torrent_hash)


CLIENTS = {
    "qbittorrent": QbitClient,
}


def create_client(kind: str, host: str, port: int, username: str, password: str) -> TorrentClient:
    try:
        cls = CLIENTS[kind]
    except KeyError:
        raise Exception(f"Unsupported torrent client '{kind}'")
    return cls(host, port, username, password)
