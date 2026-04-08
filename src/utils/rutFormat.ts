function formatRut(rut: string) {
    let sum = 0;
    let multiplier = 2;

    for (let i = rut.length - 1; i >= 0; i--) {
        sum += parseInt(rut[i], 10) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const remainder = 11 - (sum % 11);
    let verifierDigit;

    if (remainder === 11) verifierDigit = '0';
    else if (remainder === 10) verifierDigit = 'K';
    else verifierDigit = remainder.toString();

    return `${rut}-${verifierDigit}`;
}


export default formatRut;