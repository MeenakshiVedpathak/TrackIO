import toast from 'react-hot-toast';

export const useNotification = () => {
  const success = (message) => toast.success(message);
  const error = (message) => toast.error(message);
  const info = (message) => toast(message, { icon: 'ℹ️' });
  const warning = (message) => toast(message, { icon: '⚠️' });
  const loading = (message) => toast.loading(message);
  const dismiss = (id) => toast.dismiss(id);
  const promise = (promise, messages) =>
    toast.promise(promise, {
      loading: messages.loading ?? 'Loading...',
      success: messages.success ?? 'Done!',
      error: messages.error ?? 'Something went wrong.',
    });

  return { success, error, info, warning, loading, dismiss, promise };
};

export default useNotification;
