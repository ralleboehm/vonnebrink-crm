"use strict";

// ----------------------------------------------------
// Benachrichtigungen zu Verträgen
// ----------------------------------------------------
//
// contract.noticeDue   Kündigungsfrist (bzw. Vertragsende) naht
//                      → Glocke + E-Mail (Vorlage contract-reminder)
//                        an alle aktiven Admins und den Vertrieb
//
// Ausgelöst vom Erinnerungs-Zeitplaner (services/contractReminder.service.js),
// je Frist und Stufe (60/30/7 Tage) genau einmal.

const { EVENTS, register } = require("../events");

function formatDay(date) {

    return new Date(date).toLocaleDateString("de-DE", { timeZone: "UTC" });

}

function inDays(days) {

    if (days === 0) return "heute";
    if (days === 1) return "morgen";

    return `in ${days} Tagen`;

}

async function contractNoticeDue(payload, ctx) {

    const contract = payload.contract;
    const reminder = payload.reminder;

    if (!contract || !reminder) {
        throw new Error("contract.noticeDue ohne Vertrag oder Frist aufgerufen.");
    }

    const company = contract.company && contract.company.companyName ? contract.company.companyName : "";
    const label = `${contract.contractNumber || ""} ${contract.title || ""}`.trim();
    const when = inDays(reminder.daysLeft);
    const deadline = formatDay(reminder.deadline);
    const link = `/crm/contracts/${contract._id}`;

    const isNotice = reminder.kind === "notice";

    const title = isNotice
        ? `Kündigungsfrist ${when} – ${label}`
        : `Vertrag endet ${when} – ${label}`;

    const consequence = isNotice
        ? (reminder.renewalDate
            ? `Ohne Kündigung bis ${deadline} verlängert er sich am ${formatDay(reminder.renewalDate)} automatisch.`
            : `Kündigung bis ${deadline} möglich, Vertragsende ${formatDay(reminder.endDate)}.`)
        : `Der Vertrag endet am ${deadline}.`;

    const staff = await ctx.getContractStaff();

    const notified = staff.length
        ? await ctx.notifyUsers(staff.map((user) => user._id), {
            title,
            message: `${company ? company + ": " : ""}${consequence}`,
            type: reminder.daysLeft <= 7 ? "danger" : "warning",
            icon: "bi-alarm",
            link,
            event: EVENTS.CONTRACT_NOTICE_DUE
        })
        : 0;

    let emails = 0;

    for (const user of staff) {

        if (!user.email) continue;

        ctx.queueTemplateEmail("contract-reminder", user.email, {
            agent: user.firstName || "",
            contractNumber: contract.contractNumber || "",
            contractTitle: contract.title || "",
            company,
            headline: isNotice ? `Kündigungsfrist ${when}` : `Vertragsende ${when}`,
            deadline,
            deadlineLabel: isNotice ? "Kündigung bis" : "Vertragsende",
            consequence,
            contractLink: ctx.appUrl(link)
        });

        emails++;

    }

    return { contract: contract.contractNumber, notified, emails, key: reminder.key };

}

register(EVENTS.CONTRACT_NOTICE_DUE, contractNoticeDue);

module.exports = { contractNoticeDue, inDays };
