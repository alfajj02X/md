import {
  addPaise,
  bpsOf,
  computePayout,
  paiseToDisplay,
  paiseToDisplayShort,
  rupeesToPaise,
  subtractPaise,
  totalItemized,
} from '../../src/domain/money';
import { BOOKING_FEE_PAISE, PLATFORM_COMMISSION_BPS } from '../../src/domain/config';

describe('money', () => {
  test('rupeesToPaise converts without float error', () => {
    expect(rupeesToPaise(49)).toBe(4900);
    expect(rupeesToPaise(49.99)).toBe(4999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30); // classic float trap
    expect(() => rupeesToPaise(-5)).toThrow();
    expect(() => rupeesToPaise(NaN)).toThrow();
  });

  test('booking fee constant is exactly 4900 paise', () => {
    expect(BOOKING_FEE_PAISE).toBe(4900);
    expect(paiseToDisplay(BOOKING_FEE_PAISE)).toBe('₹49.00');
    expect(paiseToDisplayShort(BOOKING_FEE_PAISE)).toBe('₹49');
  });

  test('paiseToDisplay uses Indian grouping', () => {
    expect(paiseToDisplay(10000000)).toBe('₹1,00,000.00');
    expect(paiseToDisplay(0)).toBe('₹0.00');
  });

  test('addPaise / subtractPaise guard integers and negativity', () => {
    expect(addPaise(4900, 100, 25)).toBe(5025);
    expect(() => addPaise(10.5)).toThrow();
    expect(subtractPaise(5000, 4900)).toBe(100);
    expect(() => subtractPaise(100, 200)).toThrow();
  });

  test('bpsOf computes commission in integer paise', () => {
    expect(PLATFORM_COMMISSION_BPS).toBe(1000); // 10%
    expect(bpsOf(10000, 1000)).toBe(1000);
    expect(bpsOf(999, 1000)).toBe(100); // rounds 99.9 -> 100
    expect(() => bpsOf(100, 10001)).toThrow();
  });

  test('computePayout splits commission and provider net exactly', () => {
    const { commissionPaise, providerNetPaise } = computePayout(10000, 1000);
    expect(commissionPaise).toBe(1000);
    expect(providerNetPaise).toBe(9000);
    expect(commissionPaise + providerNetPaise).toBe(10000);
  });

  test('totalItemized validates itemized charges', () => {
    expect(
      totalItemized({ labourPaise: 50000, partsPaise: 20000, additionalPaise: 0, discountPaise: 5000 }),
    ).toBe(65000);
    expect(() =>
      totalItemized({ labourPaise: 1000, partsPaise: 0, additionalPaise: 0, discountPaise: 2000 }),
    ).toThrow(); // discount exceeds subtotal
    expect(() =>
      totalItemized({ labourPaise: 0, partsPaise: 0, additionalPaise: 0, discountPaise: 100 }),
    ).toThrow(); // discount on zero subtotal
  });
});
