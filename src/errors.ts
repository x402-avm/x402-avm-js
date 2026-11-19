/**
 * Typed errors thrown by x402-avm-js. Every error extends {@link X402AvmError}, carries a stable
 * string `code`, and sets `name` to the class name, so callers can use `instanceof` or `error.code`.
 */

export class X402AvmError extends Error {
  /** Stable machine-readable identifier of the error kind. */
  readonly code: string;

  constructor(message: string, code = 'x402_avm_error', options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The PAYMENT-REQUIRED header or object is malformed, or a requirement in it is not a valid exact-AVM offer. */
export class InvalidPaymentRequiredError extends X402AvmError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'invalid_payment_required', options);
  }
}

/** A network name or CAIP-2 identifier is not recognised, or has no default endpoint. */
export class UnknownNetworkError extends X402AvmError {
  readonly network: string;

  constructor(message: string, network: string) {
    super(message, 'unknown_network');
    this.network = network;
  }
}

/** The challenge offers nothing this client can pay (`accepts` is empty). */
export class NoSupportedRequirementError extends X402AvmError {
  constructor(message = 'No accepted payment requirements found in paymentRequired') {
    super(message, 'no_supported_requirement');
  }
}

/** None of the offered requirements is for the network the wallet is on, or a requirement's genesis does not match. */
export class NetworkMismatchError extends X402AvmError {
  readonly offered: string[];
  readonly expected: string;

  constructor(message: string, offered: string[], expected: string) {
    super(message, 'network_mismatch');
    this.offered = offered;
    this.expected = expected;
  }
}

/** The requested amount is above the client's spend cap. Thrown before anything is signed. */
export class SpendLimitExceededError extends X402AvmError {
  readonly asset: string;
  readonly amount: bigint;
  readonly limit: bigint;

  constructor(asset: string, amount: bigint, limit: bigint) {
    super(
      `Refusing to pay ${amount} base units of asset ${asset}: above the spend limit of ${limit}. ` +
        'Raise it explicitly with the maxAmount option if this is intended.',
      'spend_limit_exceeded'
    );
    this.asset = asset;
    this.amount = amount;
    this.limit = limit;
  }
}

/** The requirement's asset, network or recipient is not on the caller's allow list. Thrown before anything is signed. */
export class PaymentNotAllowedError extends X402AvmError {
  readonly field: 'asset' | 'network' | 'payTo';
  readonly value: string;

  constructor(field: 'asset' | 'network' | 'payTo', value: string) {
    super(`Refusing to pay: ${field} "${value}" is not in the allowed${field === 'payTo' ? 'PayTo' : field[0].toUpperCase() + field.slice(1) + 's'} list`, 'payment_not_allowed');
    this.field = field;
    this.value = value;
  }
}

/** A spend-control option is malformed (for example a negative or non-integer maxAmount). */
export class InvalidOptionsError extends X402AvmError {
  constructor(message: string) {
    super(message, 'invalid_options');
  }
}
