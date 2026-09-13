const initialUnits = 500000;
const transferCount = 20;
const transferUnits = 3;

module.exports = {
  initialUnits, transferCount, transferUnits,
  plannedClose: { balanceA: initialUnits - transferCount * transferUnits, balanceB: initialUnits + transferCount * transferUnits },
};
