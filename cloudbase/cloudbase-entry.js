import cloudbase from '@cloudbase/js-sdk/app';
import { registerAuth } from '@cloudbase/js-sdk/auth';
import { registerStorage } from '@cloudbase/js-sdk/storage';
import { registerMySQL } from '@cloudbase/js-sdk/mysql';

registerAuth(cloudbase);
registerStorage(cloudbase);
registerMySQL(cloudbase);

globalThis.cloudbase = cloudbase;
