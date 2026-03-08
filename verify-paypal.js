require('dotenv').config();
const axios = require('axios');

async function verify() {
    const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
    const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
    const rawMode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
    const mode = (rawMode === 'live' || rawMode === 'production') ? 'live' : 'sandbox';
    const host = mode === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';

    console.log(`\n--- PayPal Credential Verification ---`);
    console.log(`Mode detectado: ${mode} (Host: ${host})`);
    console.log(`Client ID: ${clientId.substring(0, 5)}...${clientId.substring(clientId.length - 5)} (Largo: ${clientId.length})`);
    console.log(`Secret: ${clientSecret.substring(0, 5)}...${clientSecret.substring(clientSecret.length - 5)} (Largo: ${clientSecret.length})`);

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
        console.log(`\nSolicitando access token a PayPal...`);
        const response = await axios({
            method: 'post',
            url: `https://${host}/v1/oauth2/token`,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: 'grant_type=client_credentials'
        });

        console.log('✅ ¡AUTENTICACIÓN EXITOSA!');
        console.log('Se ha obtenido el access token correctamente.');
        console.log('Esto confirma que las credenciales son válidas para el modo ' + mode + '.\n');
    } catch (error) {
        console.error('❌ ERROR DE AUTENTICACIÓN');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('PayPal dice:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.data.error === 'invalid_client') {
                console.log('\n--- DIAGNÓSTICO ---');
                console.log('El error "invalid_client" significa que el par ClientID:Secret es rechazado.');
                console.log('1. Verifica en el dashboard de PayPal que estés usando las credenciales de la pestaña "LIVE" (no Sandbox).');
                console.log('2. Asegúrate de que la APP en PayPal tenga el estado "Live" y "Enabled".');
                console.log('3. Revisa si hay algún carácter especial en el Secret que pueda estar siendo mal interpretado por el servidor.');
            }
        } else {
            console.error('Error de red/conexión:', error.message);
        }
        console.log('\n');
    }
}

verify();
