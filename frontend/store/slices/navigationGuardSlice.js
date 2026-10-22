import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isDirty: false,
  message: '',
};

const navigationGuardSlice = createSlice({
  name: 'navigationGuard',
  initialState,
  reducers: {
    setDirty: (state, action) => {
      state.isDirty = true;
      state.message = action.payload ?? '';
    },
    clearDirty: (state) => {
      state.isDirty = false;
      state.message = '';
    },
  },
});

export const { setDirty, clearDirty } = navigationGuardSlice.actions;

export const selectIsDirty = (state) => state.navigationGuard.isDirty;
export const selectDirtyMessage = (state) => state.navigationGuard.message;

export default navigationGuardSlice.reducer;
