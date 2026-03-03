const PaymentGatewayFactory = require('../services/payment.factory');
const PaymentWebhookService = require('../services/payment-webhook.service');

class WebhookController {
    
    /**
     * POST /api/payments/webhooks/:gatewaySlug
     */
    async handleWebhook(req, res) {
        const { gatewaySlug } = req.params;
        
        try {
            console.log(`[Webhook] Received for ${gatewaySlug}`);
        
            const strategy = await PaymentGatewayFactory.getGatewayBySlug(gatewaySlug);
            
            const result = await strategy.processWebhook(req);
            
            if (!result) {
                return res.status(200).send('Ignored event');
            }

            const { paymentId, status, externalReference, raw } = result;

            if (status === 'approved' || status === 'COMPLETED') {
                 
                 if (!raw.external_reference && externalReference) {
                     raw.external_reference = externalReference;
                 }

                 await PaymentWebhookService.processPaymentWebhook(paymentId, raw);
            } else if (status === 'rejected' || status === 'cancelled') {
                 if (externalReference) {
                    await PaymentWebhookService.handlePaymentFailure(paymentId, parseInt(externalReference));
                 }
            }

            return res.status(200).send('OK');

        } catch (error) {
            console.error(`[Webhook] Error processing ${gatewaySlug}:`, error);
          
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new WebhookController();
