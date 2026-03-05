const prisma = require('./src/config/prisma');

async function main() {
    await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION update_sku_stock()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
                UPDATE "SKU"
                SET stock = (SELECT COALESCE(SUM(stock), 0) FROM "BranchInventory" WHERE "skuId" = NEW."skuId")
                WHERE id = NEW."skuId";
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE "SKU"
                SET stock = (SELECT COALESCE(SUM(stock), 0) FROM "BranchInventory" WHERE "skuId" = OLD."skuId")
                WHERE id = OLD."skuId";
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    `);

    await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS trigger_update_sku_stock ON "BranchInventory";
    `);

    await prisma.$executeRawUnsafe(`
        CREATE TRIGGER trigger_update_sku_stock
        AFTER INSERT OR UPDATE OF stock OR DELETE ON "BranchInventory"
        FOR EACH ROW EXECUTE FUNCTION update_sku_stock();
    `);
    console.log("Triggers created successfully");
}
main().catch(console.error).finally(() => prisma.$disconnect());
