const express = require('express');
const { app } = require('electron');

class AuthServer {
    constructor(spotifyController) {
        this.spotifyController = spotifyController;
        this.server = null;
        this.port = 8888;
        console.log('AuthServer initialized');
    }

    start() {
        console.log('Starting auth server...');
        const expressApp = express();

        expressApp.get('/callback', async (req, res) => {
            console.log('Received callback with query:', req.query);
            const { code } = req.query;

            if (!code) {
                console.error('No authorization code received');
                res.send('Authorization failed: No code received');
                return;
            }

            try {
                console.log('Exchanging code for tokens...');
                const data = await this.spotifyController.spotifyApi.authorizationCodeGrant(code);
                console.log('Token exchange successful');

                const { access_token, refresh_token } = data.body;
                console.log('Setting tokens in Spotify controller');
                
                this.spotifyController.spotifyApi.setAccessToken(access_token);
                this.spotifyController.spotifyApi.setRefreshToken(refresh_token);
                this.spotifyController.isAuthorized = true;

                console.log('Authorization complete, sending success response');
                res.send(`
                    <html>
                        <body>
                            <h1>Authorization Successful!</h1>
                            <p>You can close this window and return to the app.</p>
                            <script>
                                window.close();
                            </script>
                        </body>
                    </html>
                `);
            } catch (error) {
                console.error('Error during token exchange:', error);
                res.send(`
                    <html>
                        <body>
                            <h1>Authorization Failed</h1>
                            <p>Error: ${error.message}</p>
                            <p>Please try again.</p>
                        </body>
                    </html>
                `);
            }
        });

        this.server = expressApp.listen(this.port, () => {
            console.log(`Auth server listening on port ${this.port}`);
        });

        this.server.on('error', (error) => {
            console.error('Auth server error:', error);
            if (error.code === 'EADDRINUSE') {
                console.log('Port is already in use, attempting to use existing server');
            }
        });
    }

    stop() {
        if (this.server) {
            console.log('Stopping auth server...');
            this.server.close();
            this.server = null;
            console.log('Auth server stopped');
        }
    }
}

module.exports = AuthServer; 