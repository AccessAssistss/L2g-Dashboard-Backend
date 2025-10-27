const axios = require("axios");

const sendWhatsAppMessage = async () => {
    try {
        const response = await axios.post("https://backend.aisensy.com/campaign/t1/api/v2", {
            apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4ZTRiYTg2OGJlMmRmMGQ1YjA4MGE1MSIsIm5hbWUiOiJMb2FuMmdyb3cgRmluY2FwIFB2dCBMdGQiLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjhlNGJhODY4YmUyZGYwZDViMDgwYTRiIiwiYWN0aXZlUGxhbiI6IkZSRUVfRk9SRVZFUiIsImlhdCI6MTc1OTgyMDQyMn0.5lJAJUjH3vfV5WfCopz4M2VjeZouyVBoyD6J1DvQifU",
            campaignName: "EMI Bounce Alert",
            destination: "917388729386",
            userName: "Sourabh",
            templateParams: ["Jaspreet", "2000", "LOAN2025"],
            source: "66306eb8_3073_4c01_a5a1_90769095a932",
            media: { type: "text" },
            templateName: "emi_bounce_alert",
            language: "en"
        });

        console.log("Response:", response.data);
    } catch (error) {
        console.error("Error sending WhatsApp message:", error.response?.data || error.message);
    }
};

sendWhatsAppMessage();
