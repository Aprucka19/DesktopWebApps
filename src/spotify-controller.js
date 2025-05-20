const SpotifyWebApi = require('spotify-web-api-node');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SpotifyController {
    constructor() {
        // Try to load config from config.js
        let config;
        try {
            config = require('./config');
        } catch (error) {
            console.error('Error loading config.js file:', error);
            // Fallback to example config (for development only)
            try {
                config = require('./config.example');
                console.warn('Using example config! Please create a proper config.js file for production use.');
            } catch (fallbackError) {
                console.error('Failed to load fallback config:', fallbackError);
                config = {
                    spotify: {
                        clientId: '',
                        clientSecret: '',
                        redirectUri: 'http://127.0.0.1:8888/callback'
                    }
                };
            }
        }

        this.spotifyApi = new SpotifyWebApi({
            clientId: config.spotify.clientId,
            clientSecret: config.spotify.clientSecret,
            redirectUri: config.spotify.redirectUri
        });
        this.isAuthorized = false;
        this.player = null;
        this.deviceId = null;
        console.log('SpotifyController initialized');
    }

    async initializePlayer() {
        // This will be called from the renderer process after authentication
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            script.async = true;
            document.body.appendChild(script);

            window.onSpotifyWebPlaybackSDKReady = () => {
                this.player = new window.Spotify.Player({
                    name: 'Desktop Web Apps Player',
                    getOAuthToken: cb => { cb(this.spotifyApi.getAccessToken()); },
                    volume: 0.5
                });

                // Error handling
                this.player.addListener('initialization_error', ({ message }) => {
                    console.error('Failed to initialize:', message);
                    reject(message);
                });

                this.player.addListener('authentication_error', ({ message }) => {
                    console.error('Failed to authenticate:', message);
                    reject(message);
                });

                this.player.addListener('account_error', ({ message }) => {
                    console.error('Failed to validate Spotify account:', message);
                    reject(message);
                });

                // Playback status updates
                this.player.addListener('player_state_changed', state => {
                    console.log('Player state changed:', state);
                });

                // Ready
                this.player.addListener('ready', ({ device_id }) => {
                    console.log('Ready with Device ID', device_id);
                    this.deviceId = device_id;
                    resolve(device_id);
                });

                // Not Ready
                this.player.addListener('not_ready', ({ device_id }) => {
                    console.log('Device ID has gone offline', device_id);
                });

                // Connect to the player
                this.player.connect();
            };
        });
    }

    async authorize() {
        try {
            console.log('Starting Spotify authorization process');
            
            // Check if we already have valid tokens
            if (this.spotifyApi.getAccessToken()) {
                try {
                    console.log('Checking if existing token is valid...');
                    await this.spotifyApi.getMe();
                    console.log('Existing token is valid');
                    this.isAuthorized = true;
                    return true;
                } catch (error) {
                    console.log('Existing token is invalid, starting new authorization');
                }
            }

            // Get the authorization URL
            const scopes = [
                'streaming',
                'user-read-email',
                'user-read-private',
                'user-read-playback-state',
                'user-modify-playback-state'
            ];
            
            const authUrl = this.spotifyApi.createAuthorizeURL(scopes);
            console.log('Generated authorization URL:', authUrl);
            
            // Open the authorization URL in the default browser
            require('electron').shell.openExternal(authUrl);
            console.log('Opened authorization URL in browser');
            
            return true;
        } catch (error) {
            console.error('Error in authorize method:', error);
            return false;
        }
    }

    async getActiveDevice() {
        try {
            console.log('Getting available Spotify devices...');
            const devices = await this.spotifyApi.getMyDevices();
            console.log('Available Spotify devices:', devices.body.devices.map(d => ({
                name: d.name,
                type: d.type,
                isActive: d.is_active
            })));

            // First try to find an active device
            let activeDevice = devices.body.devices.find(device => device.is_active);
            if (activeDevice) {
                console.log('Found active device:', activeDevice.name);
            }
            
            // If no active device, try to find the desktop app
            if (!activeDevice) {
                activeDevice = devices.body.devices.find(device => 
                    device.name.toLowerCase().includes('desktop') || 
                    device.name.toLowerCase().includes('web player')
                );
                if (activeDevice) {
                    console.log('Found desktop/web player device:', activeDevice.name);
                }
            }
            
            // If still no device, take the first available one
            if (!activeDevice && devices.body.devices.length > 0) {
                activeDevice = devices.body.devices[0];
                console.log('Using first available device:', activeDevice.name);
            }

            if (activeDevice) {
                console.log('Selected device for playback:', {
                    name: activeDevice.name,
                    type: activeDevice.type,
                    isActive: activeDevice.is_active
                });
                return activeDevice;
            } else {
                console.error('No available Spotify devices found');
                return null;
            }
        } catch (error) {
            console.error('Error getting Spotify devices:', error);
            return null;
        }
    }

    async searchAndPlay(songName, artistName) {
        console.log('Starting Spotify search and play process:', {
            song: songName,
            artist: artistName
        });
        
        if (!this.isAuthorized) {
            console.log('Not authorized, attempting to authorize');
            const authorized = await this.authorize();
            if (!authorized) {
                console.error('Authorization failed');
                return false;
            }
        }

        try {
            const searchQuery = `track:${songName} artist:${artistName}`;
            console.log('Searching Spotify with query:', searchQuery);
            
            const searchResults = await this.spotifyApi.searchTracks(searchQuery);
            console.log('Spotify search results:', {
                totalTracks: searchResults.body.tracks.items.length,
                firstResult: searchResults.body.tracks.items[0] ? {
                    name: searchResults.body.tracks.items[0].name,
                    artist: searchResults.body.tracks.items[0].artists[0].name,
                    uri: searchResults.body.tracks.items[0].uri
                } : null
            });
            
            if (searchResults.body.tracks.items.length > 0) {
                const trackUri = searchResults.body.tracks.items[0].uri;
                console.log('Found matching track:', {
                    uri: trackUri,
                    name: searchResults.body.tracks.items[0].name,
                    artist: searchResults.body.tracks.items[0].artists[0].name
                });
                
                // Get active device
                const activeDevice = await this.getActiveDevice();
                
                if (activeDevice) {
                    console.log('Attempting to play on device:', {
                        deviceName: activeDevice.name,
                        deviceId: activeDevice.id,
                        trackUri: trackUri
                    });
                    
                    try {
                        await this.spotifyApi.play({
                            device_id: activeDevice.id,
                            uris: [trackUri]
                        });
                        console.log('Play command sent successfully to device:', activeDevice.name);
                        return true;
                    } catch (playError) {
                        console.error('Error playing track:', {
                            error: playError.message,
                            statusCode: playError.statusCode
                        });
                        
                        if (playError.statusCode === 404) {
                            console.log('Device not found, refreshing device list...');
                            const newDevice = await this.getActiveDevice();
                            if (newDevice) {
                                console.log('Attempting playback on new device:', {
                                    deviceName: newDevice.name,
                                    deviceId: newDevice.id,
                                    trackUri: trackUri
                                });
                                
                                await this.spotifyApi.play({
                                    device_id: newDevice.id,
                                    uris: [trackUri]
                                });
                                console.log('Play command sent successfully to new device:', newDevice.name);
                                return true;
                            }
                        }
                        return false;
                    }
                } else {
                    console.error('No active Spotify device found for playback');
                }
            } else {
                console.log('No matching tracks found in Spotify for:', {
                    song: songName,
                    artist: artistName
                });
            }
            return false;
        } catch (error) {
            console.error('Error in searchAndPlay:', {
                error: error.message,
                statusCode: error.statusCode
            });
            
            if (error.statusCode === 401) {
                console.log('Token expired, resetting authorization');
                this.isAuthorized = false;
                this.spotifyApi.setAccessToken(null);
                this.spotifyApi.setRefreshToken(null);
            }
            return false;
        }
    }

    // Add methods for playback control
    async pause() {
        if (this.isAuthorized) {
            console.log('Attempting to pause playback');
            await this.spotifyApi.pause();
            console.log('Pause command sent successfully');
        }
    }

    async resume() {
        if (this.isAuthorized) {
            console.log('Attempting to resume playback');
            await this.spotifyApi.play();
            console.log('Resume command sent successfully');
        }
    }

    async setVolume(volume) {
        if (this.isAuthorized) {
            console.log('Setting volume to:', volume);
            await this.spotifyApi.setVolume(volume);
            console.log('Volume set successfully');
        }
    }

    async seek(position) {
        if (this.isAuthorized) {
            console.log('Seeking to position:', position);
            await this.spotifyApi.seek(position);
            console.log('Seek command sent successfully');
        }
    }
}

module.exports = SpotifyController; 