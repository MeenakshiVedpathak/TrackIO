import { BrowserRouter } from 'react-router-dom';
import AppRoutes from '@/routes';
import { ExportConfirmProvider } from '@/components/common/ExportConfirm';

const App = () => (
  <BrowserRouter>
    <ExportConfirmProvider>
      <AppRoutes />
    </ExportConfirmProvider>
  </BrowserRouter>
);

export default App;
