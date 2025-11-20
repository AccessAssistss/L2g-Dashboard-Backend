const calculateEMI = (loanAmount, interestRate, tenure, interestType, interestPaidBy) => {
    if (interestPaidBy === "PARTNER") {
        return loanAmount / tenure;
    }

    if (interestType === "FLAT") {
        const totalInterest = (loanAmount * interestRate * tenure) / (12 * 100);
        const totalAmount = loanAmount + totalInterest;
        return totalAmount / tenure;
    } else {
        const monthlyRate = interestRate / (12 * 100);
        const emi = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
            (Math.pow(1 + monthlyRate, tenure) - 1);
        return emi;
    }
};

module.exports = {
    calculateEMI
}