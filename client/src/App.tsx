import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Suspense, lazy } from "react";

// Lazy load page components
const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/home"));
const Game = lazy(() => import("@/pages/game"));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
  </div>
);

// Create a wrapped route component to handle Suspense
const LazyRoute = ({ component: Component, ...rest }: any) => {
  return (
    <Route
      {...rest}
      component={(props: any) => (
        <Component {...props} />
      )}
    />
  );
};

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <LazyRoute path="/" component={Home} />
        <LazyRoute path="/create" component={Home} />
        <LazyRoute path="/join" component={Home} />
        <LazyRoute path="/game/:gameId" component={Game} />
        <LazyRoute path="/lobby/:gameId" component={Game} />
        <LazyRoute component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
