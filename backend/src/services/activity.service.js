const Activity = require("../models/activity.model");

class ActivityService {

    /**
     * Neue Aktivität schreiben
     */
    async log(data) {

        const activity = new Activity({

            ticket: data.ticket,
            user: data.user,
            action: data.action,

            field: data.field || null,

            oldValue: data.oldValue ?? null,
            newValue: data.newValue ?? null,

            description: data.description || null

        });

        return await activity.save();

    }

    /**
     * Alle Aktivitäten eines Tickets
     */
    async getByTicket(ticketId) {

        return await Activity.find({

            ticket: ticketId

        })

            .populate("user")

            .sort({
                createdAt: -1
            });

    }

    /**
     * Letzte Aktivitäten
     */
    async getLatest(limit = 20) {

        return await Activity.find()

            .populate("ticket")
            .populate("user")

            .sort({
                createdAt: -1
            })

            .limit(limit);

    }

}

module.exports = new ActivityService();