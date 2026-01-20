/**
 * Customer Controller
 * Handles HTTP requests for customer devices
 */

import { Request, Response, NextFunction } from 'express';
import * as customerService from './customer.service.js';
import { logger } from '../../utils/logger.js';

/**
 * GET /api/customer/devices
 * Fetch all Indusmind customer devices
 */
export const getCustomerDevices = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const devices = await customerService.getAllIndusmindCustomerDevices();
    
    res.json({
      success: true,
      data: devices,
      count: devices.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
console.error('Error in getCustomerDevices controller:', error);
    next(error);
  }
};
