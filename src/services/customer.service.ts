/**
 * Customer Service
 * Handles external API calls to Indusmind customer devices API
 */

import axios from 'axios';

const INDUSMIND_API_URL = 'http://52.47.152.33:3666/customer/getAllIndusmindCustomerDevices';

export interface CustomerDevice {
  id: number;
  name: string;
  label: string;
  deviceUUID: string;
  accessToken: string;
  assignedToCustomer: boolean;
  customerId: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch all Indusmind customer devices from external API
 */
export const getAllIndusmindCustomerDevices = async (): Promise<CustomerDevice[]> => {
  try {
    console.log('Fetching customer devices from:', INDUSMIND_API_URL);
    
    const response = await axios.post(INDUSMIND_API_URL, {"customerName":"Indusmind"}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Response status:', response.status);
    console.log('Response data type:', Array.isArray(response.data) ? 'array' : 'object');
    
    // Handle both response formats: { data: [...] } or [...]
    if (Array.isArray(response.data)) {
      return response.data;
    }
    
    return response.data.data || [];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Axios error:', error.message);
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    } else {
      console.error('Error fetching Indusmind customer devices:', error);
    }
    throw error;
  }
};
