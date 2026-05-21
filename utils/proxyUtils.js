const axios = require("axios");

// ##########----------Pull Credit Report using CRIF----------##########
const crifReport = async (applicantData) => {
    try {
        const payload = {
            "REQUEST-FILE": {
                "HEADER-SEGMENT": {
                    "PRODUCT-TYPE": "CIR PRO V2",
                    "PRODUCT-VER": "2.0",
                    "REQ-VOL-TYPE": "C04",
                    "REQ-ACTN-TYPE": "AT01",
                    "INQ-DT-TM": applicantData.inquiryDateTime || "23-09-2025 12:00",
                    "AUTH-FLG": "Y",
                    "AUTH-TITLE": "USER",
                    "RES-FRMT": "HTML",
                    "RES-FRMT-EMBD": "Y",
                    "LOS-NAME": "INHOUSE",
                    "REQ-SERVICES-TYPE": "CIR"
                },
                "INQUIRY": {
                    "APPLICANT-SEGMENT": {
                        "APPLICANT-ID": applicantData.applicantId,
                        "FIRST-NAME": applicantData.firstName || "",
                        "MIDDLE-NAME": applicantData.middleName || "",
                        "LAST-NAME": applicantData.lastName || "",
                        "DOB": {
                            "DOB-DT": applicantData.dob
                        },
                        "IDS": [
                            {
                                "TYPE": "ID07",
                                "VALUE": applicantData.pan_number
                            }
                        ],
                        "ADDRESSES": [
                            {
                                "TYPE": "D05",
                                "ADDRESS-TEXT": applicantData.address,
                                "CITY": applicantData.city,
                                "STATE": applicantData.state,
                                "PIN": applicantData.pincode,
                                "COUNTRY": "INDIA"
                            }
                        ],
                        "PHONES": [
                            {
                                "TYPE": "P04",
                                "VALUE": applicantData.mobile
                            }
                        ]
                    },
                    "APPLICATION-SEGMENT": {
                        "INQUIRY-UNIQUE-REF-NO": applicantData.inquiryId,
                        "CREDIT-RPT-ID": "",
                        "CREDIT-RPT-TRN-DT-TM": applicantData.inquiryDateTime || "23-09-2025 12:00",
                        "CREDIT-INQ-PURPS-TYPE": "CP06",
                        "CREDIT-INQUIRY-STAGE": "COLLECTION",
                        "CLIENT-CONTRIBUTOR-ID": "PRB0000003",
                        "APPLICATION-ID": applicantData.applicationId,
                        "LOAN-AMT": applicantData.loanAmount,
                        "LTV": applicantData.ltv,
                        "TERM": applicantData.term,
                        "LOAN-TYPE": "A10"
                    }
                }
            }
        };

        const headers = {
            "userid": process.env.PROXY_CRIF_USER_ID,
            "password": process.env.PROXY_CRIF_PASSWORD,
            "Content-Type": "application/json",
        };

        const url = `${process.env.BASE_URL}/api/v1/proxy/earnplus/crif/CRIFCreditReport`;
        const response = await axios.post(url, payload, { headers, validateStatus: () => true });

        if (response.status === 200) {
            return { success: true, data: response.data };
        } else {
            return { success: false, data: response.data, statusCode: response.status };
        }
    } catch (error) {
        console.error("Error while fetching CRIF report:", error.message);
        return { success: false, error: error.message, statusCode: 500 };
    }
};

module.exports = {
    crifReport,
};