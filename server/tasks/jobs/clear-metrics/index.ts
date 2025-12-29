import { version } from '~/utils/config';
export default defineEventHandler(event => {
  return {
    message: `After loosing countless braincells, I've deployed the backend on CF Workers. (v${version})`,
  };
});
