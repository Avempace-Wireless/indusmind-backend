/**
 * Customer Routes
 * Defines API endpoints for customer device operations
 */

import { Router } from 'express';
import { getCustomerDevices } from '../controllers/customer.controller.js';

export const customerRouter = Router();

/**
 * GET /customer/devices
 * Fetch all Indusmind customer devices
 */
customerRouter.get('/devices', getCustomerDevices);
