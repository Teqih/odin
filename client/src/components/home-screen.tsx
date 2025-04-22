import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import LanguageSelector from "@/components/ui/language-selector";

const HomeScreen: React.FC = () => {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  
  const handleCreateGame = () => {
    navigate("/create");
  };
  
  const handleJoinGame = () => {
    navigate("/join");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-6xl font-bold text-primary mb-4">{t('app.title')}</h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          {t('app.description')}
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mt-6">
        <Button 
          size="lg"
          className="flex items-center" 
          onClick={handleCreateGame}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 mr-2" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          {t('button.createGame')}
        </Button>
        
        <Button 
          variant="outline" 
          size="lg"
          className="flex items-center" 
          onClick={handleJoinGame}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 mr-2" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
          </svg>
          {t('button.joinGame')}
        </Button>
      </div>
      
      <Card className="mt-12 max-w-md w-full">
        <CardContent className="pt-6">
          <h2 className="text-2xl font-semibold mb-4">{t('howToPlay.title')}</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>{t('howToPlay.rule1')}</li>
            <li>{t('howToPlay.rule2')}</li>
            <li>{t('howToPlay.rule3')}</li>
            <li>{t('howToPlay.rule4')}</li>
            <li>{t('howToPlay.rule5')}</li>
            <li>{t('howToPlay.rule6')}</li>
            <li>{t('howToPlay.rule7')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default HomeScreen;
