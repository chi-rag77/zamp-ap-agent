import Decimal from 'decimal.js';
export const D=Decimal.clone({precision:40,rounding:Decimal.ROUND_HALF_UP});
export type DecimalValue=InstanceType<typeof D>;
export function decimal(value:string|number|DecimalValue):DecimalValue {
  const s=typeof value==='number'?String(value):String(value);
  if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s))throw new Error(`INVALID_AMOUNT_FORMAT: ${s}`);
  const d=new D(s);
  if(!d.isFinite())throw new Error('INVALID_AMOUNT_FORMAT');
  return d;
}
export const fixed=(value:DecimalValue)=>value.toDecimalPlaces(4).toFixed(4);
export const percent=(actual:DecimalValue,reference:DecimalValue):number|null=>reference.isZero()?null:actual.minus(reference).div(reference).times(100).toDecimalPlaces(4).toNumber();
export const within=(a:DecimalValue,b:DecimalValue,tolerance='0.01')=>a.minus(b).abs().lte(decimal(tolerance));
export const sum=(values:DecimalValue[])=>values.reduce((acc,value)=>acc.plus(value),new D(0));
export function priceVariance(actual:string,expected:string){const a=decimal(actual),e=decimal(expected);return {amount:fixed(a.minus(e)),percent:percent(a,e),validReference:!e.isZero()}}
export function remainingQuantity(ordered:string,previous:string){return fixed(decimal(ordered).minus(decimal(previous)))}
export function lineAmount(quantity:string,unitPrice:string){return fixed(decimal(quantity).times(decimal(unitPrice)))}
export function taxAmount(base:string,rate:string){return fixed(decimal(base).times(decimal(rate)))}
