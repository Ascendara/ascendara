use discord_rich_presence::{DiscordIpc, DiscordIpcClient};

use crate::{error, info, warn};

const CLIENT_ID: &str = "1277379302945718356";

pub fn setup() -> Option<DiscordIpcClient> {
    info!("[ENTRY] setup_discord_rpc()");
    info!("Initializing Discord Rich Presence");
    let mut client = DiscordIpcClient::new(CLIENT_ID);
    match client.connect() {
        Ok(()) => {
            info!("Successfully connected to Discord RPC");
            info!("[EXIT] setup_discord_rpc() - Success");
            Some(client)
        }
        Err(e) => {
            error!("Failed to connect to Discord RPC: {e}");
            info!("[EXIT] setup_discord_rpc() - Failure");
            None
        }
    }
}

pub fn clear(client: Option<DiscordIpcClient>) {
    info!("[ENTRY] clear_discord_presence()");
    let Some(mut client) = client else {
        warn!("[EXIT] clear_discord_presence() - No RPC client provided");
        return;
    };
    info!("Clearing Discord presence");
    match client.clear_activity().and_then(|_| client.close()) {
        Ok(()) => info!("[EXIT] clear_discord_presence() - Success"),
        Err(e) => {
            error!("Failed to clear Discord presence: {e}");
            info!("[EXIT] clear_discord_presence() - Failure");
        }
    }
}
