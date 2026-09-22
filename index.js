/**
 * @format
 */

// Must stay the first import: gesture-handler patches native touch handling at load time.
import 'react-native-gesture-handler';
// registerRootComponent registers the app under the name "main", which the generated Android
// MainActivity looks up, and wires Expo's dev-tools error overlay in development.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
