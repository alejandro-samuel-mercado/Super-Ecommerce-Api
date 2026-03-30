const prisma = require("../config/prisma");
const EventService = require("../services/event.service");
const AuditService = require("../services/audit.service");

const getConfig = async (req, res) => {
  try {
    let config = await prisma.storeConfig.findFirst({
      where: { id: 1 },
    });

    if (!config) {
      config = await prisma.storeConfig.create({
        data: {
          taxRate: 0,
          currencySymbol: "$",
          enablePoints: true,
          enableShipping: true,
          maintenanceMode: false,
          enableBranches: true,
          enableTransfers: true,
          enableStockMovements: true,
          enableStockControl: true,
          enableManualStock: true,
          lowStockThreshold: 5,
          criticalStockThreshold: 2,
          country: "Argentina",
          baseCurrency: "ARS",
          defaultCurrency: "ARS",
        },
      });
    }

    const activeEvent = await EventService.getActiveEvent();

    let finalConfig = { ...config };

    if (activeEvent) {
      finalConfig.enablePoints = activeEvent.pointsEnabled;
      finalConfig.enablePointsRedemption = activeEvent.pointsEnabled;
      finalConfig.enableShipping = activeEvent.shippingEnabled;
      finalConfig.enableCoupons = activeEvent.couponsEnabled;

      if (activeEvent.paymentMethods && activeEvent.paymentMethods.length > 0) {
        finalConfig.enabledPaymentMethods = activeEvent.paymentMethods;
      }

      if (
        activeEvent.deliveryMethods &&
        activeEvent.deliveryMethods.length > 0
      ) {
        finalConfig.deliveryMethods = activeEvent.deliveryMethods;
      }

      finalConfig.overriddenByEvent = {
        marqueeText: !!activeEvent.marqueeText,
        bannerImage: !!activeEvent.heroBanners,
        secondaryAds: !!activeEvent.secondaryAds,
        enableShipping: true,
        enablePoints: true,
        enabledPaymentMethods: (activeEvent.paymentMethods || []).length > 0,
      };
    }

    res.json({ ...finalConfig, activeEvent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateConfig = async (req, res) => {
  try {
    const data = req.body;
    const updateData = {};

    const fields = [
      "taxRate",
      "currencySymbol",
      "enablePoints",
      "enableShipping",
      "maintenanceMode",
      "storeName",
      "contactEmail",
      "contactPhone",
      "address",
      "socialInstagram",
      "socialFacebook",
      "socialTwitter",
      "preventStockout",
      "pointsPerCurrency",
      "freeShippingThreshold",
      "enableEvents",
      "enablePointsRedemption",
      "moneyPerPoint",
      "logoUrl",
      "marqueeText",
      "bannerImage",
      "adImage",
      "adText",
      "secondaryAds",
      "openingHours",
      "enableBranches",
      "enableTransfers",
      "enableStockMovements",
      "enableStockControl",
      "enableManualStock",
      "webSafetyStock",
      "lowStockThreshold",
      "criticalStockThreshold",
      "baseCurrency",
      "enableAutoBackup",
      "backupFrequency",
      "country",
      "enablePersistentQr",
      "persistentQrUrl",
      "defaultCurrency",
      "institutionalVideo",
      "institutionalVideoTitle",
      "whatsappProductMessage",
      "navItemName",
      "customPageTitle",
      "customPageDescription",
      "customPageImage",
      "customPageVideo",
      "customPageImages",
      "customPageVideos",
      "customPageTexts",
      "customPageTextsSubtitle",
      "customPageImagesSubtitle",
      "customPageVideosSubtitle"
    ];

    fields.forEach((f) => {
      if (data[f] !== undefined) updateData[f] = data[f];
    });

    if (data.lowStockThreshold !== undefined) {
      updateData.lowStockThreshold = parseInt(data.lowStockThreshold) || 0;
    }

    if (data.criticalStockThreshold !== undefined) {
      updateData.criticalStockThreshold =
        parseInt(data.criticalStockThreshold) || 0;
    }

    if (data.customMeasurementUnits) {
      updateData.customMeasurementUnits = Array.isArray(
        data.customMeasurementUnits,
      )
        ? data.customMeasurementUnits
        : [];
    }

    if (data.customPageImages) {
      updateData.customPageImages = Array.isArray(data.customPageImages) ? data.customPageImages : [];
    }
    if (data.customPageVideos) {
      updateData.customPageVideos = Array.isArray(data.customPageVideos) ? data.customPageVideos : [];
    }
    if (data.customPageTexts) {
      updateData.customPageTexts = Array.isArray(data.customPageTexts) ? data.customPageTexts : [];
    }
    if (data.enabledPaymentMethods !== undefined) {
      updateData.enabledPaymentMethods = Array.isArray(
        data.enabledPaymentMethods,
      )
        ? data.enabledPaymentMethods
        : null;
    }

    const config = await prisma.storeConfig.upsert({
      where: { id: 1 },
      update: updateData,
      create: {
        id: 1,
        ...updateData,
      },
    });

    if (updateData.baseCurrency) {
      await prisma.currency.upsert({
        where: { code: updateData.baseCurrency.toUpperCase() },
        update: { isActive: true, exchangeRateToBase: 1.0 },
        create: {
          code: updateData.baseCurrency.toUpperCase(),
          symbol: updateData.currencySymbol || config.currencySymbol || '$',
          exchangeRateToBase: 1.0,
          isActive: true
        }
      });
    }

    if (updateData.defaultCurrency) {
      await prisma.currency.upsert({
        where: { code: updateData.defaultCurrency.toUpperCase() },
        update: { isActive: true },
        create: {
          code: updateData.defaultCurrency.toUpperCase(),
          symbol: '$',
          exchangeRateToBase: 1.0,
          isActive: true
        }
      });
    }

    await AuditService.logAction({
      adminId: req.user.id,
      action: "UPDATE_CONFIG",
      entityType: "STORE_CONFIG",
      entityId: 1,
      changes: updateData,
      ip: req.ip,
    });

    res.json(config);
  } catch (error) {
    console.error("[ConfigController] Error updating config:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};

const getPublicConfig = async (req, res) => {
  try {
    let config;
    try {
      config = await prisma.storeConfig.findFirst({
        where: { id: 1 }
      });
    } catch (dbError) {
      console.error("[ConfigController] DB Error fetching config, using defaults:", dbError.message);
      config = null;
    }

    if (!config) {
      config = {
        storeName: "StyleStore",
        contactPhone: "",
        enableShipping: true,
        enablePoints: true,
        country: "Argentina",
        baseCurrency: "ARS",
      };
    }

    const publicFields = [
      "storeName", "contactEmail", "contactPhone", "address",
      "socialInstagram", "socialFacebook", "socialTwitter",
      "logoUrl", "marqueeText", "bannerImage", "adImage",
      "adText", "secondaryAds", "openingHours", "enablePoints",
      "enableShipping", "enablePointsRedemption", "moneyPerPoint",
      "freeShippingThreshold", "enabledPaymentMethods", "baseCurrency",
      "pointsPerCurrency", "webSafetyStock", "enablePersistentQr",
      "persistentQrUrl", "country", "defaultCurrency", "enableManualStock",
      "institutionalVideo", "institutionalVideoTitle", "whatsappProductMessage",
      "navItemName", "customPageTitle", "customPageDescription",
      "customPageImage", "customPageVideo", "customPageImages",
      "customPageVideos", "customPageTexts", "customPageTextsSubtitle",
      "customPageImagesSubtitle", "customPageVideosSubtitle"
    ];

    const sanitizedConfig = {};
    publicFields.forEach(field => {
      if (config[field] !== undefined) {
        sanitizedConfig[field] = config[field];
      }
    });

    // Ensure country and baseCurrency are never null/empty
    if (!sanitizedConfig.country) sanitizedConfig.country = "Argentina";
    if (!sanitizedConfig.baseCurrency) sanitizedConfig.baseCurrency = "ARS";

    const activeEvent = await EventService.getActiveEvent();

    let finalConfig = { ...sanitizedConfig };

    if (activeEvent) {
      if (activeEvent.marqueeText && activeEvent.marqueeText.length > 0) {
        finalConfig.marqueeText = activeEvent.marqueeText;
      }
      if (activeEvent.heroBanners && activeEvent.heroBanners.length > 0) {
        finalConfig.bannerImage = activeEvent.heroBanners;
      }
      if (activeEvent.secondaryAds && activeEvent.secondaryAds.length > 0) {
        finalConfig.secondaryAds = activeEvent.secondaryAds;
      }

      finalConfig.enableShipping = activeEvent.shippingEnabled;
      finalConfig.enablePoints = activeEvent.pointsEnabled;
      finalConfig.enablePointsRedemption = activeEvent.pointsEnabled;
      finalConfig.enableCoupons = activeEvent.couponsEnabled;

      if (activeEvent.paymentMethods && activeEvent.paymentMethods.length > 0) {
        finalConfig.enabledPaymentMethods = activeEvent.paymentMethods;
      }
    }

    const CurrencyService = require("../services/currency.service");
    const detectedCurrency = await CurrencyService.getCurrencyByContext(req);

    res.json({ ...finalConfig, activeEvent, detectedCurrency });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  getPublicConfig,
};
// Trigger nodemon restart for Prisma Client update


