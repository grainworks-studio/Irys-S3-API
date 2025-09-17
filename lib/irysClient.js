import { Uploader } from '@irys/upload';
import { Ethereum } from '@irys/upload-ethereum';
import config from '../config/config.js'

let irysUploader = null;
/**
 * Get or create an Irys uploader instance
 * @returns {Promise<Object>} Irys uploader instance
 */
export async function getIrysUploader() {
  if (irysUploader) {
    return irysUploader;
  }

  try {
    irysUploader = await Uploader(Ethereum)
      .withWallet(config.irys.privateKey);
    
      if (config.irys.network === 'devnet') {
        irysUploader = irysUploader.devnet();
      }

      console.log(`Connected to Irys from address ${irysUploader.address}`);
      return irysUploader;
    } catch (error) {
    console.error('Error initializing Irys uploader:', error);
    throw new Error('Failed to initialize Irys uploader');
  }
}

/**
 * Upload a file to Irys
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} contentType - MIME type
 * @param {Array} customTags - Additional tags
 * @returns {Promise<Object>} Upload receipt
 */
export async function uploadToIrys(fileBuffer, contentType = 'application/octet-stream', customTags = []) {
  try {
    const uploader = await getIrysUploader();
    const tags = [
      { name: 'Content-Type', value: contentType },
      ...customTags
    ];
    const receipt = await uploader.upload(fileBuffer, { tags });

    console.log(`File uploaded to Irys: ${receipt.id}`);
    return receipt;
  } catch (error) {
    console.error('Error uploading to Irys:', error);
    throw new Error('Failed to upload to Irys');
  }
}

/**
 * Fund the Irys account if needed
 * @param {number} bytes - Number of bytes to price for upload
 * @returns {Promise<number>} Price in atomic units
 */
export async function fundAccount(bytes) {
  try {
    const uploader = await getIrysUploader();
    const price = await uploader.getPrice(bytes);
    return price;
  } catch (error) {
    console.error('Error funding account: ', error);
    throw new Error('Failed to get upload price');
  }
}

/**
 * Get account balance
 * @returns {Promise<string>} Balance in atomic units
 */
export async function getBalance() {
  try {
    const uploader = await getIrysUploader();
    const balance = await uploader.getBalance();

    return balance;
  } catch (error) {
    console.error('Error getting balance:', error);
    throw new Error('Failed to get balance');
  }
}