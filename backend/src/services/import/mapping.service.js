class MappingService {

    /**
     * Mapping aus dem Formular bereinigen
     */
    build(formData) {

        const mapping = {};

        for (const [csvField, crmField] of Object.entries(formData)) {

            if (!crmField) {
                continue;
            }

            if (crmField === "ignore") {
                continue;
            }

            mapping[csvField] = crmField;

        }

        return mapping;

    }

}

module.exports = new MappingService();