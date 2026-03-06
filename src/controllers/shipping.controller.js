const ShippingService = require('../services/shipping.service');


const getZones = async (req, res) => {
    try {
        const zones = await ShippingService.getAllZones();
        res.json(zones);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createZone = async (req, res) => {
    try {
        const zone = await ShippingService.createZone(req.body);
        res.json(zone);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateZone = async (req, res) => {
    try {
        const { id } = req.params;
        const zone = await ShippingService.updateZone(id, req.body);
        res.json(zone);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const deleteZone = async (req, res) => {
    try {
        const { id } = req.params;
        await ShippingService.deleteZone(id);
        res.json({ message: 'Zone deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const calculateCost = async (req, res) => {
    try {
        const { country, province, city, subtotal } = req.body;
        const addressData = { country, province, city };
        const currency = req.headers['x-currency'] || req.query.currency;
        
        const cost = await ShippingService.calculateShippingCost(addressData, 'DOMICILIO', currency, subtotal);
        
        res.json({ cost, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getAvailableZones = async (req, res) => {
    try {
        const zones = await ShippingService.getAllZones();
      
        const available = zones.filter(z => z.active).map(z => ({
            id: z.id,
            country: z.country,
            province: z.province,
            city: z.city,
            cost: z.cost
        }));
        res.json(available);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getZones,
    createZone,
    updateZone,
    deleteZone,
    calculateCost,
    getAvailableZones
};
