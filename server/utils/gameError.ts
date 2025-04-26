import { ErrorCode } from '../constants/errorCodes';

export class GameError extends Error {
  code: ErrorCode;
  
  constructor(code: ErrorCode, message?: string) {
    // If no custom message is provided, use the error code as the message
    super(message || code);
    this.code = code;
    this.name = 'GameError';
  }
}
